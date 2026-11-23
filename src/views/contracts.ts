/** Contratos e vencimentos: o que cada cliente contratou e quando vence. */
import { formatShortDate, relativeDay } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney, pluralize } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { CONTRACT_KINDS, CONTRACT_STATE_LABELS, contractState, deleteContract, renewContract, saveContract, sortedContracts } from '../domain/clientcare.ts';
import { findClient } from '../domain/selectors.ts';
import type { ContractKind, ContractRecord } from '../domain/types.ts';
import { allowed, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, emptyState, externalLink, pageHeader, panel } from '../ui/components.ts';
import { formActions, selectField, textField, textareaField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

const RECURRENCE = [
  { value: 'unico', label: 'Pagamento único' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'anual', label: 'Anual' },
];

export function openContractForm(contract?: ContractRecord, clientId?: string): void {
  const { data } = store();
  if (!data.clients.length) {
    toast('Cadastre o cliente primeiro.', 'error');
    return;
  }
  openModal({
    title: contract ? 'Editar contrato' : 'Novo contrato',
    description: 'Site, manutenção mensal, domínio ou hospedagem. O sistema avisa 30 dias antes de vencer.',
    body: html`<form class="form" data-form="contract:save" data-id="${contract?.id ?? ''}">
      <div class="form-grid">
        ${selectField({ name: 'clientId', label: 'Cliente', value: contract?.clientId ?? clientId ?? null, required: true, emptyLabel: 'Escolha o cliente', options: [...data.clients].sort((a, b) => a.company.localeCompare(b.company, 'pt-BR')).map((c) => ({ value: c.id, label: c.company })) })}
        ${selectField({ name: 'kind', label: 'Tipo', value: contract?.kind ?? 'site', options: CONTRACT_KINDS })}
        ${textField({ name: 'title', label: 'Nome do contrato', value: contract?.title, placeholder: 'Ex.: Site one page + Manutenção Essencial', className: 'form-grid__full' })}
        ${textField({ name: 'startDate', label: 'Início', type: 'date', value: contract?.startDate ?? today(), required: true })}
        ${textField({ name: 'endDate', label: 'Fim', type: 'date', value: contract?.endDate ?? '', hint: 'Vazio = sem data de fim.' })}
        ${allowed('finance:view') ? textField({ name: 'amount', label: 'Valor (R$)', value: contract?.amount === null || contract?.amount === undefined ? '' : String(contract.amount).replace('.', ','), inputmode: 'decimal' }) : ''}
        ${selectField({ name: 'recurrence', label: 'Cobrança', value: contract?.recurrence ?? 'unico', options: RECURRENCE })}
        ${textField({ name: 'link', label: 'Link do contrato assinado', value: contract?.link, type: 'url', placeholder: 'https://drive...', className: 'form-grid__full' })}
      </div>
      <label class="check-row"><input type="checkbox" class="check" name="signed" ${contract?.signed ? 'checked' : ''} /> <span>Contrato assinado</span></label>
      ${textareaField({ name: 'notes', label: 'Observações', value: contract?.notes, rows: 2 })}
      ${formActions(contract ? 'Salvar' : 'Registrar contrato', contract ? button({ label: 'Apagar', action: 'contract:delete', variant: 'ghost', icon: 'trash', data: { id: contract.id } }) : undefined)}
    </form>`,
  });
}

export function contractRows(list: ContractRecord[], options: { showClient: boolean }): SafeHtml {
  const { data } = store();
  const t = today();
  const finance = allowed('finance:view');
  return html`<ul class="contract-list">
    ${list.map((c) => {
      const state = contractState(c, t);
      const meta = CONTRACT_STATE_LABELS[state];
      const client = findClient(data, c.clientId);
      return html`<li class="${cx('contract-row', `is-${state}`)}">
        <div class="contract-row__main">
          <button type="button" class="contract-row__title" data-action="contract:edit" data-id="${c.id}">${c.title}</button>
          <span class="contract-row__sub">
            ${options.showClient && client ? html`<a href="#/clientes/${client.id}">${client.company}</a> · ` : ''}
            ${CONTRACT_KINDS.find((k) => k.value === c.kind)?.label ?? ''}
            ${finance && c.amount !== null ? html` · ${formatCurrency(c.amount, true)}${c.recurrence === 'mensal' ? '/mês' : c.recurrence === 'anual' ? '/ano' : ''}` : ''}
            ${c.signed ? html` · ${icon('check', 12)} assinado` : html` · <span class="text-warning">não assinado</span>`}
          </span>
        </div>
        <span class="contract-row__dates">
          <span>${formatShortDate(c.startDate)} → ${c.endDate ? formatShortDate(c.endDate) : 'sem fim'}</span>
          ${c.endDate && state !== 'ativo' ? html`<small>${state === 'vencido' ? 'venceu' : 'vence'} ${relativeDay(c.endDate, t)}</small>` : ''}
        </span>
        ${badge(meta.label, meta.tone)}
        <span class="contract-row__actions">
          ${c.link ? externalLink(c.link, 'Abrir') : ''}
          ${c.endDate && state !== 'ativo' ? button({ label: 'Renovar', action: 'contract:renew', size: 'sm', icon: 'repeat', data: { id: c.id } }) : ''}
        </span>
      </li>`;
    })}
  </ul>`;
}

function render(): SafeHtml {
  const { data } = store();
  const t = today();
  const list = sortedContracts(data, t);
  const ending = list.filter((c) => contractState(c, t) === 'vencendo').length;
  const late = list.filter((c) => contractState(c, t) === 'vencido').length;
  return html`
    ${pageHeader({
      title: 'Contratos e vencimentos',
      subtitle: `${pluralize(list.length, 'contrato', 'contratos')}${ending ? ` · ${ending} vencendo em 30 dias` : ''}${late ? ` · ${late} vencido${late > 1 ? 's' : ''}` : ''}`,
      actions: button({ label: 'Novo contrato', action: 'contract:new', variant: 'primary', icon: 'plus' }),
    })}
    ${panel({
      title: 'Todos os contratos',
      icon: 'repeat',
      body: list.length
        ? contractRows(list, { showClient: true })
        : emptyState({ icon: 'repeat', title: 'Nenhum contrato registrado', text: 'Registre o site, a manutenção e o domínio de cada cliente. 30 dias antes de vencer, aparece no Pra fazer hoje.', action: button({ label: 'Novo contrato', action: 'contract:new', variant: 'primary', icon: 'plus' }) }),
    })}
  `;
}

export const contractsView: View = { title: () => 'Contratos e vencimentos', render };

registerForms({
  'contract:save': async (form, values) => {
    const id = form.dataset.id || null;
    const previous = id ? (store().data.contracts ?? []).find((c) => c.id === id) : undefined;
    const amountText = values.text('amount');
    const amount = allowed('finance:view') ? (amountText ? parseMoney(amountText) : null) : (previous?.amount ?? null);
    if (amountText && amount === null) throw new Error('Valor inválido.');
    await store().apply((draft, ctx) =>
      saveContract(
        draft,
        id,
        {
          clientId: values.text('clientId'),
          title: values.text('title'),
          kind: values.text('kind') as ContractKind,
          startDate: values.text('startDate'),
          endDate: values.optional('endDate'),
          amount,
          recurrence: values.text('recurrence') as ContractRecord['recurrence'],
          signed: values.checked('signed'),
          link: values.text('link'),
          notes: values.text('notes'),
        },
        ctx,
      ),
    );
    closeModal();
    toast(id ? 'Contrato salvo.' : 'Contrato registrado.');
  },
});

registerActions({
  'contract:new': (el) => openContractForm(undefined, el.dataset.client),
  'contract:edit': (el) => {
    const contract = (store().data.contracts ?? []).find((c) => c.id === el.dataset.id);
    if (contract) openContractForm(contract);
  },
  'contract:renew': async (el) => {
    const contract = await store().apply((draft) => renewContract(draft, el.dataset.id!));
    toast(`Renovado até ${formatShortDate(contract.endDate!)}.`);
  },
  'contract:delete': async (el) => {
    const ok = await confirmAction({ title: 'Apagar contrato?', text: 'O registro some da lista de vencimentos.', confirmLabel: 'Apagar' });
    if (!ok) return;
    await store().apply((draft) => deleteContract(draft, el.dataset.id!));
    closeModal();
    toast('Contrato apagado.');
  },
});
