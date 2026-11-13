/** Clientes: cadastro, projetos relacionados, contratação, parcelas e pendências. */
import { formatShortDate, monthKey, monthLabel } from '../core/dates.ts';
import { categoryNames } from '../domain/categories.ts';
import { whatsappLink } from '../domain/commercial.ts';
import { deleteSubscription, paySubscription, saveSubscription, subscriptionDates, toggleFinanceEntryPaid, type SubscriptionInput } from '../domain/finance.ts';
import { externalLink } from '../ui/components.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney, pluralize } from '../core/format.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import { navigate, type Route } from '../core/router.ts';
import { CONTRACT_STATUSES, PROJECT_STATUSES, PROPOSAL_STATUSES, labelOf, projectStatusLabel, toneOf } from '../domain/labels.ts';
import {
  addClientLink,
  removeClientLink,
  setClientDomain,
  addInstallment,
  addPendingItem,
  createClient,
  removeInstallment,
  toggleInstallmentPaid,
  togglePendingItem,
  updateClient,
  type ClientInput,
} from '../domain/operations.ts';
import { peopleNames } from '../domain/people.ts';
import { clientFinance, findClient, projectProgress, projectsOfClient, tasksRelatedTo } from '../domain/selectors.ts';
import type { Client, ContractStatus } from '../domain/types.ts';
import { allowed, requirePermission, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, demoTag, dueDate, emptyState, notice, pageHeader, panel, progressBar } from '../ui/components.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';
import { taskList, taskRow } from '../ui/task-row.ts';
import { openProjectForm } from './projects.ts';
import { openProposalForm, proposalsOfClient } from './proposals.ts';

function openClientForm(client?: Client): void {
  const v: ClientInput = client ?? { company: '', contactName: '', segment: '', contact: {}, city: '', contractStatus: 'proposta_enviada', nextStep: '', notes: '' };
  openModal({
    title: client ? 'Editar cliente' : 'Novo cliente',
    size: 'lg',
    body: html`
      <form class="form" data-form="client:save" data-id="${client?.id ?? ''}">
        <div class="form-grid">
          ${textField({ name: 'company', label: 'Empresa', value: v.company, required: true, autofocus: true })}
          ${textField({ name: 'contactName', label: 'Contato principal', value: v.contactName })}
          ${textField({ name: 'segment', label: 'Nicho', value: v.segment, suggestions: categoryNames(store().data, 'segmento') })}
          ${textField({ name: 'city', label: 'Cidade', value: v.city })}
          ${textField({ name: 'email', label: 'E-mail', type: 'email', value: v.contact.email })}
          ${textField({ name: 'phone', label: 'Telefone / WhatsApp', type: 'tel', value: v.contact.phone })}
          ${selectField({ name: 'contractStatus', label: 'Status da contratação', value: v.contractStatus, options: CONTRACT_STATUSES })}
          ${textField({ name: 'instagram', label: 'Instagram', value: v.contact.instagram })}
        </div>
        ${textField({ name: 'nextStep', label: 'Próximo passo', value: v.nextStep })}
        ${textareaField({ name: 'notes', label: 'Observações', value: v.notes })}
        ${formActions(client ? 'Salvar alterações' : 'Cadastrar cliente')}
      </form>
    `,
  });
}

function openSubscriptionForm(clientId: string, subId?: string): void {
  const { data } = store();
  const client = findClient(data, clientId);
  const sub = client?.subscriptions?.find((x) => x.id === subId);
  const plans = data.services.filter((s) => s.billing === 'mensal' && (s.active || s.id === sub?.serviceId));
  const first = plans[0];
  const v: SubscriptionInput = sub ?? { name: first?.name ?? 'Plano mensal', serviceId: first?.id ?? null, amount: first?.price ?? 0, billingDay: Number(today().slice(8, 10)), startMonth: monthKey(today()), endMonth: null, active: true };
  openModal({
    title: sub ? 'Editar plano mensal' : 'Ativar plano mensal',
    description: 'O sistema cria a cobrança de cada mês sozinho (aparece no Financeiro e no Foco de hoje). É só marcar quando o cliente pagar.',
    body: html`
      <form class="form" data-form="subscription:save" data-client="${clientId}" data-id="${sub?.id ?? ''}">
        <div class="form-grid">
          ${selectField({ name: 'serviceId', label: 'Plano do catálogo', value: v.serviceId ?? '', emptyLabel: 'Outro (digitar abaixo)', options: plans.map((p) => ({ value: p.id, label: `${p.name} · ${formatCurrency(p.price, true)}/mês` })) })}
          ${textField({ name: 'name', label: 'Nome do plano', value: v.name, required: true })}
          ${textField({ name: 'amount', label: 'Valor por mês (R$)', value: v.amount ? String(v.amount).replace('.', ',') : '', required: true, inputmode: 'decimal', hint: 'Se escolher um plano do catálogo e deixar o valor como está, usa o preço do catálogo.' })}
          ${textField({ name: 'billingDay', label: 'Dia do vencimento', type: 'number', value: v.billingDay, required: true })}
          ${textField({ name: 'startMonth', label: 'Primeiro mês cobrado', type: 'month', value: v.startMonth, required: true })}
          ${textField({ name: 'endMonth', label: 'Último mês (opcional)', type: 'month', value: v.endMonth ?? '', hint: 'Deixe vazio enquanto o plano continuar.' })}
          ${selectField({ name: 'active', label: 'Situação', value: v.active ? 'sim' : 'nao', options: [{ value: 'sim', label: 'Ativo' }, { value: 'nao', label: 'Pausado (não gera cobrança)' }] })}
        </div>
        ${formActions(sub ? 'Salvar plano' : 'Ativar plano', sub ? button({ label: 'Excluir plano', action: 'subscription:delete', variant: 'ghost', icon: 'trash', size: 'sm', data: { client: clientId, id: sub.id } }) : undefined)}
      </form>`,
  });
}

function openLinkForm(clientId: string): void {
  openModal({
    title: 'Adicionar link',
    description: 'Site publicado, perfil do Google, pasta de artes, Canva... Nunca guarde senhas aqui.',
    body: html`
      <form class="form" data-form="client-link:save" data-client="${clientId}">
        ${textField({ name: 'label', label: 'Nome', placeholder: 'Ex.: Google Meu Negócio', autofocus: true, suggestions: ['Site publicado', 'Google Meu Negócio', 'Instagram', 'Pasta de artes', 'Canva', 'Repositório (GitHub)', 'Hospedagem (Vercel/Lovable)', 'Contrato assinado'] })}
        ${textField({ name: 'url', label: 'Endereço (link)', type: 'url', required: true, placeholder: 'https://' })}
        ${formActions('Adicionar link')}
      </form>`,
  });
}

function openDomainForm(clientId: string): void {
  const client = findClient(store().data, clientId);
  openModal({
    title: 'Domínio do cliente',
    description: 'Avisamos no Foco de hoje 30 dias antes da renovação, para lembrar o cliente de pagar o registro.br.',
    body: html`
      <form class="form" data-form="client-domain:save" data-client="${clientId}">
        <div class="form-grid">
          ${textField({ name: 'name', label: 'Domínio', value: client?.domain?.name ?? '', placeholder: 'ex.: thehouse.com.br', autofocus: true })}
          ${textField({ name: 'renewsOn', label: 'Renova em', type: 'date', value: client?.domain?.renewsOn ?? '' })}
        </div>
        ${formActions('Salvar')}
      </form>`,
  });
}

function openInstallmentForm(clientId: string): void {
  openModal({
    title: 'Registrar parcela',
    description: 'Registro manual para controle interno. O Mawe OS não cobra nem processa pagamentos.',
    body: html`
      <form class="form" data-form="installment:save" data-client="${clientId}">
        ${textField({ name: 'description', label: 'Descrição', required: true, autofocus: true, placeholder: 'Ex.: Entrada (40%)' })}
        <div class="form-grid">
          ${textField({ name: 'amount', label: 'Valor (R$)', required: true, inputmode: 'decimal', placeholder: '0,00' })}
          ${textField({ name: 'dueDate', label: 'Vencimento', type: 'date', required: true, value: today() })}
          ${selectField({ name: 'method', label: 'Forma prevista', value: 'Pix', options: ['Pix', 'Transferência', 'Boleto', 'Cartão', 'Outro'].map((m) => ({ value: m, label: m })) })}
        </div>
        ${formActions('Registrar parcela')}
      </form>
    `,
  });
}

registerForms({
  'client:save': async (form, values) => {
    requirePermission('commercial:edit');
    const input: ClientInput = {
      company: values.text('company'),
      contactName: values.text('contactName'),
      segment: values.text('segment'),
      city: values.text('city'),
      contact: { email: values.text('email') || undefined, phone: values.text('phone') || undefined, instagram: values.text('instagram') || undefined },
      contractStatus: values.text('contractStatus') as ContractStatus,
      nextStep: values.text('nextStep'),
      notes: values.text('notes'),
    };
    if (!input.company) throw new Error('Informe o nome da empresa.');
    const id = form.dataset.id;
    if (id) await store().apply((draft) => updateClient(draft, id, input));
    else {
      const client = await store().apply((draft, ctx) => createClient(draft, input, ctx));
      navigate(`/clientes/${client.id}`);
    }
    closeModal();
    toast(id ? 'Cliente atualizado.' : 'Cliente cadastrado.');
  },
  'installment:save': async (form, values) => {
    requirePermission('finance:edit');
    const amount = parseMoney(values.text('amount'));
    if (amount === null || amount <= 0) throw new Error('Informe um valor maior que zero.');
    await store().apply((draft) =>
      addInstallment(draft, form.dataset.client!, { description: values.text('description'), amount, dueDate: values.text('dueDate'), method: values.text('method') }),
    );
    closeModal();
    toast('Parcela registrada.');
  },
  'subscription:save': async (form, values) => {
    requirePermission('finance:edit');
    const { data } = store();
    const serviceId = values.optional('serviceId');
    const service = data.services.find((s) => s.id === serviceId);
    const amount = parseMoney(values.text('amount')) ?? service?.price ?? 0;
    const input: SubscriptionInput = {
      serviceId,
      name: values.text('name') || service?.name || 'Plano mensal',
      amount,
      billingDay: Number(values.text('billingDay')),
      startMonth: values.text('startMonth'),
      endMonth: values.optional('endMonth'),
      active: values.text('active') !== 'nao',
    };
    await store().apply((draft, ctx) => saveSubscription(draft, form.dataset.client!, form.dataset.id || null, input, ctx));
    closeModal();
    toast(form.dataset.id ? 'Plano atualizado.' : 'Plano ativado. A cobrança de cada mês aparece no Financeiro.');
  },
  'client-link:save': async (form, values) => {
    requirePermission('commercial:edit');
    await store().apply((draft) => addClientLink(draft, form.dataset.client!, values.text('label'), values.text('url')));
    closeModal();
    toast('Link adicionado.');
  },
  'client-domain:save': async (form, values) => {
    requirePermission('commercial:edit');
    await store().apply((draft) => setClientDomain(draft, form.dataset.client!, values.text('name'), values.optional('renewsOn')));
    closeModal();
    toast('Domínio salvo.');
  },
  'pending:add': async (form, values) => {
    const text = values.text('text');
    if (!text) return;
    await store().apply((draft) => addPendingItem(draft, form.dataset.client!, text));
  },
});

registerActions({
  'client:new': () => openClientForm(),
  'client:edit': (el) => {
    const client = findClient(store().data, el.dataset.id);
    if (client) openClientForm(client);
  },
  'client:new-project': (el) => openProjectForm(undefined, el.dataset.id),
  'client:new-proposal': (el) => openProposalForm(undefined, { clientId: el.dataset.id }),
  'installment:new': (el) => openInstallmentForm(el.dataset.client!),
  'subscription:new': (el) => openSubscriptionForm(el.dataset.client!),
  'subscription:edit': (el) => openSubscriptionForm(el.dataset.client!, el.dataset.id),
  'subscription:delete': async (el) => {
    requirePermission('finance:edit');
    const ok = await confirmAction({ title: 'Excluir plano', text: 'As próximas cobranças deixam de ser criadas. Os pagamentos já registrados continuam no Financeiro.', confirmLabel: 'Excluir' });
    if (!ok) return;
    await store().apply((draft) => deleteSubscription(draft, el.dataset.client!, el.dataset.id!));
    toast('Plano excluído.');
  },
  'subscription:pay': async (el) => {
    requirePermission('finance:edit');
    const entry = store().data.finance.entries.find((e) => e.subscriptionId === el.dataset.id && e.dueDate === el.dataset.date);
    if (entry) await store().apply((draft) => toggleFinanceEntryPaid(draft, entry.id, today()));
    else await store().apply((draft, ctx) => paySubscription(draft, el.dataset.client!, el.dataset.id!, el.dataset.date!, today(), ctx));
  },
  'subscription:charge': (el) => {
    const client = findClient(store().data, el.dataset.client);
    const sub = client?.subscriptions?.find((x) => x.id === el.dataset.id);
    if (!client || !sub) return;
    const first = client.contactName.split(' ')[0] || client.company;
    const text = `Oi, ${first}! Tudo bem? Passando para lembrar da mensalidade do ${sub.name} (${formatCurrency(sub.amount, true)}) com vencimento em ${formatShortDate(el.dataset.date!)}. Pode ser pelo Pix de sempre. Qualquer dúvida, estou por aqui!`;
    const link = whatsappLink(client.contact.phone, text);
    if (!link) {
      toast('Cadastre o WhatsApp do cliente (botão Editar) para mandar o lembrete.', 'info');
      return;
    }
    window.open(link, '_blank', 'noopener');
  },
  'client-link:new': (el) => openLinkForm(el.dataset.client!),
  'client-link:remove': async (el) => {
    requirePermission('commercial:edit');
    await store().apply((draft) => removeClientLink(draft, el.dataset.client!, el.dataset.id!));
  },
  'client-domain:edit': (el) => openDomainForm(el.dataset.client!),
  'installment:toggle': async (el) => {
    requirePermission('finance:edit');
    await store().apply((draft) => toggleInstallmentPaid(draft, el.dataset.client!, el.dataset.id!, today()));
  },
  'installment:remove': async (el) => {
    requirePermission('finance:edit');
    const ok = await confirmAction({ title: 'Remover parcela', text: 'O registro desta parcela será apagado.', confirmLabel: 'Remover' });
    if (!ok) return;
    await store().apply((draft) => removeInstallment(draft, el.dataset.client!, el.dataset.id!));
  },
  'pending:toggle': async (el) => {
    await store().apply((draft) => togglePendingItem(draft, el.dataset.client!, el.dataset.id!));
  },
});

function renderList(): SafeHtml {
  const { data } = store();
  const t = today();
  const finance = allowed('finance:view');
  const clients = [...data.clients].sort((a, b) => a.company.localeCompare(b.company));
  const active = clients.filter((c) => c.contractStatus !== 'concluido' && c.contractStatus !== 'pausado').length;

  return html`
    ${pageHeader({
      title: 'Clientes',
      subtitle: `${pluralize(clients.length, 'cliente', 'clientes')} · ${pluralize(active, 'com contrato ativo', 'com contrato ativo')}`,
      actions: button({ label: 'Novo cliente', action: 'client:new', variant: 'primary', icon: 'plus' }),
    })}
    ${clients.length
      ? html`<div class="client-grid">
          ${clients.map((c) => {
            const f = clientFinance(c, t);
            const projects = projectsOfClient(data, c.id);
            const pending = c.pendingItems.filter((p) => !p.done).length;
            return html`
              <a class="client-card" href="#/clientes/${c.id}">
                <span class="client-card__head">
                  <span>
                    <span class="client-card__name">${c.company}</span>
                    <span class="client-card__sub">${c.contactName}${c.segment ? ` · ${c.segment}` : ''}</span>
                  </span>
                  ${badge(labelOf(CONTRACT_STATUSES, c.contractStatus), toneOf(CONTRACT_STATUSES, c.contractStatus))}
                </span>
                <span class="client-card__facts">
                  <span>${icon('projects', 14)} ${pluralize(projects.length, 'projeto', 'projetos')}</span>
                  <span class="${cx(pending && 'text-warning')}">${icon('flag', 14)} ${pluralize(pending, 'pendência', 'pendências')}</span>
                  ${demoTag(c)}
                </span>
                ${finance && f.total
                  ? html`<span class="client-card__finance">
                      <span class="client-card__finance-row"><span>Recebido</span><strong>${formatCurrency(f.paid)} <small>de ${formatCurrency(f.total)}</small></strong></span>
                      ${progressBar((f.paid / f.total) * 100, 'Valor recebido')}
                      ${f.overdueCount ? html`<span class="text-danger">${icon('alert', 13)} ${pluralize(f.overdueCount, 'parcela vencida', 'parcelas vencidas')}</span>` : ''}
                    </span>`
                  : ''}
                ${finance && (c.subscriptions ?? []).some((s) => s.active)
                  ? html`<span class="client-card__plan">${icon('repeat', 13)} ${(c.subscriptions ?? []).filter((s) => s.active).map((s) => `${s.name} · ${formatCurrency(s.amount, true)}/mês`).join(' + ')}</span>`
                  : ''}
                ${c.nextStep ? html`<span class="client-card__next">${icon('arrowRight', 13)} ${c.nextStep}</span>` : ''}
              </a>`;
          })}
        </div>`
      : html`<div class="panel">${emptyState({
          icon: 'clients',
          title: 'Nenhum cliente cadastrado',
          text: 'Cadastre clientes diretamente ou converta uma oportunidade ganha no Comercial.',
          action: button({ label: 'Novo cliente', action: 'client:new', variant: 'primary', icon: 'plus' }),
        })}</div>`}
  `;
}

function renderPayments(client: Client): SafeHtml {
  const t = today();
  if (!allowed('finance:view')) {
    return panel({ title: 'Pagamentos', icon: 'lock', body: notice({ title: 'Informação restrita', text: 'Seu perfil não tem acesso aos dados financeiros.', icon: 'lock' }) });
  }
  const f = clientFinance(client, t);
  const canEdit = allowed('finance:edit');
  return panel({
    title: 'Pagamentos e parcelas',
    icon: 'money',
    action: canEdit ? button({ label: 'Registrar parcela', action: 'installment:new', variant: 'ghost', icon: 'plus', size: 'sm', data: { client: client.id } }) : undefined,
    body: html`
      ${client.installments.length
        ? html`
          <div class="finance-summary">
            <div><span>Total</span><strong>${formatCurrency(f.total, true)}</strong></div>
            <div><span>Recebido</span><strong class="text-success">${formatCurrency(f.paid, true)}</strong></div>
            <div><span>Em aberto</span><strong>${formatCurrency(f.pending, true)}</strong></div>
            <div><span>Vencido</span><strong class="${cx(f.overdue && 'text-danger')}">${formatCurrency(f.overdue, true)}</strong></div>
          </div>
          <ul class="installments">
            ${client.installments.map((i) => {
              const overdue = !i.paidAt && i.dueDate < t;
              return html`<li class="${cx('installment', i.paidAt && 'is-paid', overdue && 'is-overdue')}">
                <input type="checkbox" class="check" ${i.paidAt ? 'checked' : ''} ${canEdit ? '' : 'disabled'} data-change="installment:toggle" data-client="${client.id}" data-id="${i.id}" aria-label="Marcar ${i.description} como paga" />
                <div class="installment__main">
                  <span class="installment__title">${i.description}</span>
                  <span class="installment__meta">${i.paidAt ? html`<span class="text-success">Paga em ${formatShortDate(i.paidAt)}</span>` : dueDate(i.dueDate, t)} · ${i.method}</span>
                </div>
                <span class="installment__amount">${formatCurrency(i.amount, true)}</span>
                ${canEdit ? button({ label: 'Remover parcela', iconOnly: true, icon: 'trash', variant: 'ghost', size: 'sm', action: 'installment:remove', data: { client: client.id, id: i.id } }) : ''}
              </li>`;
            })}
          </ul>`
        : emptyState({ icon: 'money', compact: true, title: 'Nenhuma parcela registrada', text: 'Registre as parcelas combinadas para acompanhar os recebimentos.' })}
      <p class="panel__foot">${icon('info', 13)} Controle manual: marcar como paga não movimenta dinheiro. As parcelas aparecem também no <a href="#/financeiro">Financeiro</a>.</p>
    `,
  });
}

/** Quanto o cliente já pagou no total (parcelas + planos + entradas ligadas a ele). */
function lifetimeValue(client: Client): number {
  const { data } = store();
  const installments = client.installments.filter((i) => i.paidAt).reduce((s, i) => s + i.amount, 0);
  const entries = data.finance.entries.filter((e) => e.kind === 'entrada' && e.clientId === client.id && e.paidAt).reduce((s, e) => s + e.amount, 0);
  return installments + entries;
}

function renderSummary(client: Client): SafeHtml {
  if (!allowed('finance:view')) return html``;
  const t = today();
  const f = clientFinance(client, t);
  const monthly = (client.subscriptions ?? []).filter((s) => s.active).reduce((sum, s) => sum + s.amount, 0);
  return html`<div class="client-summary">
    <div><span>Já pagou no total</span><strong class="text-success">${formatCurrency(lifetimeValue(client), true)}</strong></div>
    <div><span>Plano mensal</span><strong>${monthly ? `${formatCurrency(monthly, true)}/mês` : '—'}</strong></div>
    <div><span>Em aberto</span><strong class="${cx(f.overdue && 'text-danger')}">${formatCurrency(f.pending, true)}</strong></div>
    <div><span>Cliente desde</span><strong>${formatShortDate(client.createdAt.slice(0, 10))}</strong></div>
  </div>`;
}

function renderPlans(client: Client): SafeHtml {
  if (!allowed('finance:view')) return html``;
  const { data } = store();
  const t = today();
  const canEdit = allowed('finance:edit');
  const subs = client.subscriptions ?? [];
  const month = monthKey(t);
  return panel({
    title: 'Planos mensais',
    icon: 'repeat',
    count: subs.filter((s) => s.active).length,
    action: canEdit ? button({ label: 'Ativar plano', action: 'subscription:new', variant: 'ghost', icon: 'plus', size: 'sm', data: { client: client.id } }) : undefined,
    body: subs.length
      ? html`<ul class="plans">${subs.map((sub) => {
          const dates = subscriptionDates(sub, `${sub.startMonth}-01`, `${month}-31`).slice(-4).reverse();
          return html`<li class="${cx('plan', !sub.active && 'is-paused')}">
            <div class="plan__head">
              <strong>${sub.name}</strong>
              <span>${formatCurrency(sub.amount, true)}/mês · vence dia ${sub.billingDay}${sub.active ? '' : ' · pausado'}${sub.endMonth ? ` · até ${monthLabel(sub.endMonth)}` : ''}</span>
              ${canEdit ? button({ label: 'Editar plano', iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', action: 'subscription:edit', data: { client: client.id, id: sub.id } }) : ''}
            </div>
            ${sub.active && dates.length
              ? html`<ul class="plan__months">${dates.map((date) => {
                  const entry = data.finance.entries.find((e) => e.subscriptionId === sub.id && e.dueDate === date);
                  const paid = Boolean(entry?.paidAt);
                  const late = !paid && date < t;
                  return html`<li class="${cx('plan__month', paid && 'is-paid', late && 'is-late')}">
                    <label><input type="checkbox" class="check" ${paid ? 'checked' : ''} ${canEdit ? '' : 'disabled'} data-change="subscription:pay" data-client="${client.id}" data-id="${sub.id}" data-date="${date}" />
                      <span>${monthLabel(date.slice(0, 7))}</span></label>
                    <span class="plan__status">${paid ? `Pago em ${formatShortDate(entry!.paidAt!)}` : late ? `Vencido · ${formatShortDate(date)}` : `Vence ${formatShortDate(date)}`}</span>
                    ${!paid && canEdit ? button({ label: 'Lembrar no WhatsApp', icon: 'chat', variant: 'ghost', size: 'sm', action: 'subscription:charge', data: { client: client.id, id: sub.id, date } }) : ''}
                  </li>`;
                })}</ul>`
              : ''}
          </li>`;
        })}</ul>`
      : emptyState({ icon: 'repeat', compact: true, title: 'Nenhum plano mensal', text: 'Ative o plano (ex.: Essencial) para o sistema criar a cobrança de todo mês e somar na receita recorrente.' }),
  });
}

function renderLinks(client: Client): SafeHtml {
  const canEdit = allowed('commercial:edit');
  const t = today();
  const renews = client.domain?.renewsOn;
  return panel({
    title: 'Acessos e links',
    icon: 'link',
    action: canEdit ? button({ label: 'Adicionar link', action: 'client-link:new', variant: 'ghost', icon: 'plus', size: 'sm', data: { client: client.id } }) : undefined,
    body: html`
      <div class="domain-row">
        <span class="domain-row__icon">${icon('globe', 16)}</span>
        <div>
          <strong>${client.domain?.name || 'Domínio não informado'}</strong>
          <small class="${cx(renews && renews < t && 'text-danger')}">${renews ? `Renova em ${formatShortDate(renews)}` : 'Informe a data de renovação para receber o aviso'}</small>
        </div>
        ${canEdit ? button({ label: 'Editar domínio', iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', action: 'client-domain:edit', data: { client: client.id } }) : ''}
      </div>
      ${(client.links ?? []).length
        ? html`<ul class="link-rows">${(client.links ?? []).map(
            (l) => html`<li>${externalLink(l.url, l.label)}${canEdit ? button({ label: `Remover ${l.label}`, iconOnly: true, icon: 'close', variant: 'ghost', size: 'sm', action: 'client-link:remove', data: { client: client.id, id: l.id } }) : ''}</li>`,
          )}</ul>`
        : html`<p class="muted small">Guarde aqui o site publicado, o Google Meu Negócio, a pasta de artes... Tudo num lugar só.</p>`}
      <p class="panel__foot">${icon('lock', 13)} Não guarde senhas aqui: use um gerenciador de senhas.</p>
    `,
  });
}

function renderDetail(client: Client): SafeHtml {
  const { data } = store();
  const t = today();
  const projects = projectsOfClient(data, client.id);
  const tasks = tasksRelatedTo(data, { type: 'client', id: client.id });
  const opportunity = data.opportunities.find((o) => o.clientId === client.id);

  return html`
    ${pageHeader({
      title: client.company,
      back: { href: '#/clientes', label: 'Clientes' },
      subtitle: html`${badge(labelOf(CONTRACT_STATUSES, client.contractStatus), toneOf(CONTRACT_STATUSES, client.contractStatus))} ${demoTag(client)} <span class="muted">${[client.segment, client.city].filter(Boolean).join(' · ')}</span>`,
      actions: button({ label: 'Editar', action: 'client:edit', icon: 'edit', data: { id: client.id } }),
    })}

    ${renderSummary(client)}

    <div class="detail-grid">
      <div class="detail-grid__main">
        ${panel({
          title: 'Projetos',
          icon: 'projects',
          count: projects.length,
          action: allowed('projects:edit') ? button({ label: 'Novo projeto', action: 'client:new-project', variant: 'ghost', icon: 'plus', size: 'sm', data: { id: client.id } }) : undefined,
          body: projects.length
            ? html`<ul class="project-mini-list">${projects.map((p) => html`<li>
                <a class="project-mini" href="#/projetos/${p.id}">
                  <span class="project-mini__head"><span class="project-mini__name">${p.name}</span>${badge(projectStatusLabel(p.type, p.status), toneOf(PROJECT_STATUSES, p.status))}</span>
                  <span class="project-mini__progress">${progressBar(projectProgress(p))}<span>${projectProgress(p)}%</span></span>
                  <span class="project-mini__due">Entrega ${formatShortDate(p.dueDate)} · ${peopleNames(data, p.ownerIds, '')}</span>
                </a></li>`)}</ul>`
            : emptyState({ icon: 'projects', compact: true, title: 'Nenhum projeto para este cliente' }),
        })}

        ${renderPlans(client)}
        ${renderPayments(client)}

        ${panel({
          title: 'Propostas',
          icon: 'file',
          count: proposalsOfClient(data, client.id).length,
          action: allowed('commercial:edit') ? button({ label: 'Nova proposta', action: 'client:new-proposal', variant: 'ghost', icon: 'plus', size: 'sm', data: { id: client.id } }) : undefined,
          body: proposalsOfClient(data, client.id).length
            ? html`<ul class="link-list">${proposalsOfClient(data, client.id).map((p) => html`<li><a href="#/comercial/propostas/${p.id}">${p.title}</a> ${badge(labelOf(PROPOSAL_STATUSES, p.status), toneOf(PROPOSAL_STATUSES, p.status))}</li>`)}</ul>`
            : emptyState({ icon: 'file', compact: true, title: 'Nenhuma proposta para este cliente' }),
        })}

        ${tasks.length
          ? panel({ title: 'Tarefas relacionadas', icon: 'tasks', count: tasks.length, body: taskList(tasks.map((task) => taskRow(data, task, t, { showRelated: false }))) })
          : ''}
      </div>

      <aside class="detail-grid__side">
        ${panel({
          title: 'Próximo passo',
          body: html`<p class="lead-text">${client.nextStep || html`<span class="muted">Não definido</span>`}</p>`,
        })}
        ${panel({
          title: 'Pendências',
          icon: 'flag',
          count: client.pendingItems.filter((p) => !p.done).length,
          body: html`
            ${client.pendingItems.length
              ? html`<ul class="checklist">${client.pendingItems.map(
                  (p) => html`<li class="${cx('checklist__item', p.done && 'is-done')}">
                    <label><input type="checkbox" class="check" ${p.done ? 'checked' : ''} data-change="pending:toggle" data-client="${client.id}" data-id="${p.id}" /><span>${p.text}</span></label>
                  </li>`,
                )}</ul>`
              : emptyState({ icon: 'check', compact: true, title: 'Nenhuma pendência' })}
            <form class="inline-form" data-form="pending:add" data-client="${client.id}">
              <label class="visually-hidden" for="pending-new">Nova pendência</label>
              <input id="pending-new" class="input" name="text" placeholder="Nova pendência" autocomplete="off" />
              <button class="btn btn--secondary btn--icon" type="submit" aria-label="Adicionar pendência">${icon('plus', 16)}</button>
            </form>
          `,
        })}
        ${panel({
          title: 'Contato',
          body: html`
            <dl class="info info--stack">
              <div class="info__item"><dt>Contato principal</dt><dd>${client.contactName || '—'}</dd></div>
              <div class="info__item"><dt>E-mail</dt><dd>${client.contact.email || '—'}</dd></div>
              <div class="info__item"><dt>Telefone</dt><dd>${client.contact.phone || '—'}</dd></div>
              ${client.contact.instagram ? html`<div class="info__item"><dt>Instagram</dt><dd>${client.contact.instagram}</dd></div>` : ''}
            </dl>
            ${opportunity ? html`<a class="panel__link" href="#/comercial/${opportunity.id}">Ver histórico comercial ${icon('arrowRight', 14)}</a>` : ''}
          `,
        })}
        ${renderLinks(client)}
        ${client.notes ? panel({ title: 'Observações', body: html`<p>${multiline(client.notes)}</p>` }) : ''}
      </aside>
    </div>
  `;
}

export const clientsView: View = {
  title: (route: Route) => findClient(store().data, route.params[0])?.company ?? 'Clientes',
  render: (route: Route) => {
    if (route.params[0]) {
      const client = findClient(store().data, route.params[0]);
      if (client) return renderDetail(client);
      return html`${pageHeader({ title: 'Cliente não encontrado', back: { href: '#/clientes', label: 'Clientes' } })}
        <div class="panel">${emptyState({ icon: 'clients', title: 'Este cliente não existe ou foi removido.' })}</div>`;
    }
    return renderList();
  },
};
