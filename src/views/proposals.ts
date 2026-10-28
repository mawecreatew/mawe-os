/** Comercial › Propostas e contratos: proposta com serviços do catálogo, status e aceite. */
import { formatLongDate, formatShortDate, monthKey } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney, pluralize } from '../core/format.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import { navigate } from '../core/router.ts';
import {
  acceptProposal,
  deleteProposal,
  proposalRecipient,
  proposalTotals,
  saveProposal,
  setProposalStatus,
  type ProposalInput,
  type ProposalItemInput,
} from '../domain/business.ts';
import { PAYMENT_TERMS, PROPOSAL_STATUSES, PROJECT_TYPES, SERVICE_CATEGORIES, isOpenStage, labelOf, projectTypeForCategory, toneOf } from '../domain/labels.ts';
import type { AppData, ID, Opportunity, Proposal, ProposalStatus } from '../domain/types.ts';
import { allowed, requirePermission, rerender, store, today } from '../app/context.ts';
import { badge, button, demoTag, emptyState, externalLink, pageHeader, panel, segmented, statCard } from '../ui/components.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

const ui = { status: 'todas' as ProposalStatus | 'todas' };

export function findProposal(data: AppData, id: ID | undefined): Proposal | undefined {
  return data.proposals.find((p) => p.id === id);
}

export function proposalsOfOpportunity(data: AppData, opp: Opportunity): Proposal[] {
  return data.proposals.filter((p) => p.opportunityId === opp.id || (opp.clientId && p.clientId === opp.clientId));
}

export function proposalsOfClient(data: AppData, clientId: ID): Proposal[] {
  return data.proposals.filter((p) => p.clientId === clientId);
}

/** Abas do Comercial: oportunidades (funil) e propostas. */
export function commercialTabs(active: 'oportunidades' | 'propostas'): SafeHtml {
  const count = store().data.proposals.filter((p) => p.status === 'enviada').length;
  return html`<nav class="subnav" aria-label="Seções do Comercial">
    <a class="${cx('subnav__item', active === 'oportunidades' && 'is-active')}" href="#/comercial" ${active === 'oportunidades' ? html`aria-current="page"` : ''}>${icon('kanban', 15)} Oportunidades</a>
    <a class="${cx('subnav__item', active === 'propostas' && 'is-active')}" href="#/comercial/propostas" ${active === 'propostas' ? html`aria-current="page"` : ''}>${icon('file', 15)} Propostas e contratos ${count ? html`<span class="segmented__count">${count}</span>` : ''}</a>
  </nav>`;
}

function totalsText(p: Pick<Proposal, 'items'>): string {
  const t = proposalTotals(p);
  const parts = [];
  if (t.oneTime || !t.monthly) parts.push(formatCurrency(t.oneTime, true));
  if (t.monthly) parts.push(`${formatCurrency(t.monthly, true)}/mês`);
  return parts.join(' + ');
}

// ---------------------------------------------------------------- Formulário

export function openProposalForm(proposal?: Proposal, preset: { clientId?: ID; opportunityId?: ID } = {}): void {
  const { data } = store();
  const services = data.services.filter((s) => s.active || proposal?.items.some((i) => i.serviceId === s.id));
  if (!services.length) {
    toast('Cadastre seus serviços em "Serviços e preços" antes de criar uma proposta.', 'info');
    navigate('/servicos');
    return;
  }
  const recipient = proposal
    ? proposal.clientId ? `cli:${proposal.clientId}` : `opp:${proposal.opportunityId}`
    : preset.clientId ? `cli:${preset.clientId}` : preset.opportunityId ? `opp:${preset.opportunityId}` : '';
  const openOpps = data.opportunities.filter((o) => !o.clientId && (isOpenStage(o.stage) || o.id === proposal?.opportunityId || o.id === preset.opportunityId));
  const chosen = (serviceId: string) => proposal?.items.find((i) => i.serviceId === serviceId);
  const byCategory = SERVICE_CATEGORIES.map((c) => ({ ...c, items: services.filter((s) => s.category === c.value) })).filter((c) => c.items.length);

  openModal({
    title: proposal ? 'Editar proposta' : 'Nova proposta',
    description: 'Escolha os serviços do catálogo. O valor total é calculado automaticamente; dá para ajustar o preço de cada item.',
    size: 'lg',
    body: html`
      <form class="form" data-form="proposal:save" data-id="${proposal?.id ?? ''}" data-input="proposal:recalc">
        <div class="form-grid">
          <div class="field">
            <label class="field__label" for="proposal-to">Para quem<span class="field__req" aria-hidden="true"> *</span></label>
            <select class="input select" id="proposal-to" name="to" required>
              <option value="">Escolha o cliente ou a oportunidade</option>
              ${data.clients.length
                ? html`<optgroup label="Clientes">${[...data.clients].sort((a, b) => a.company.localeCompare(b.company)).map((c) => html`<option value="cli:${c.id}" ${recipient === `cli:${c.id}` ? 'selected' : ''}>${c.company}</option>`)}</optgroup>`
                : ''}
              ${openOpps.length
                ? html`<optgroup label="Oportunidades (ainda não são clientes)">${openOpps.map((o) => html`<option value="opp:${o.id}" ${recipient === `opp:${o.id}` ? 'selected' : ''}>${o.company}</option>`)}</optgroup>`
                : ''}
            </select>
          </div>
          ${textField({ name: 'title', label: 'Título', value: proposal?.title ?? '', placeholder: 'Deixe vazio para "Proposta – Nome do cliente"' })}
        </div>

        <fieldset class="field service-picker">
          <legend class="field__label">Serviços<span class="field__req" aria-hidden="true"> *</span></legend>
          ${byCategory.map(
            (cat) => html`<div class="service-picker__group">
              <span class="service-picker__cat">${cat.label}</span>
              ${cat.items.map((s) => {
                const item = chosen(s.id);
                return html`<div class="${cx('service-pick', item && 'is-on')}" data-service-row>
                  <label class="service-pick__name">
                    <input type="checkbox" class="check" name="svc" value="${s.id}" ${item ? 'checked' : ''} />
                    <span>${s.name}${s.active ? '' : html` <small class="muted">(desativado)</small>`}</span>
                  </label>
                  <label class="service-pick__qty"><span class="visually-hidden">Quantidade de ${s.name}</span>
                    <input class="input" type="number" min="1" step="1" name="qty:${s.id}" value="${item?.quantity ?? 1}" inputmode="numeric" /></label>
                  <label class="service-pick__price"><span class="visually-hidden">Valor de ${s.name}</span>
                    <input class="input" name="price:${s.id}" value="${String(item?.price ?? s.price).replace('.', ',')}" inputmode="decimal" data-billing="${s.billing}" /></label>
                  <span class="service-pick__billing">${s.billing === 'mensal' ? '/mês' : 'único'}</span>
                </div>`;
              })}
            </div>`,
          )}
          <p class="proposal-total" data-proposal-total aria-live="polite">${proposal ? `Total: ${totalsText(proposal)}` : 'Total: R$ 0,00'}</p>
        </fieldset>

        <div class="form-grid">
          ${selectField({ name: 'paymentTerms', label: 'Forma de pagamento', value: proposal?.paymentTerms || PAYMENT_TERMS[0], options: [...new Set([...PAYMENT_TERMS, proposal?.paymentTerms || PAYMENT_TERMS[0]])].map((t) => ({ value: t, label: t })) })}
          ${textField({ name: 'validUntil', label: 'Válida até', type: 'date', value: proposal?.validUntil ?? '' })}
          ${textField({ name: 'startDate', label: 'Data de início', type: 'date', value: proposal?.startDate ?? '' })}
          ${textField({ name: 'contractLink', label: 'Contrato assinado (link do PDF)', value: proposal?.contractLink ?? '', placeholder: 'drive.google.com/...', hint: 'Suba o PDF no Drive e cole o link aqui.' })}
        </div>
        ${textareaField({ name: 'notes', label: 'Observações', value: proposal?.notes ?? '', rows: 3 })}
        ${formActions(proposal ? 'Salvar proposta' : 'Criar proposta')}
      </form>
    `,
  });
}

function readItems(form: HTMLFormElement): ProposalItemInput[] {
  const data = new FormData(form);
  return data.getAll('svc').map((value) => {
    const id = String(value);
    return {
      serviceId: id,
      quantity: Number(data.get(`qty:${id}`)) || 1,
      price: parseMoney(String(data.get(`price:${id}`) ?? '')) ?? undefined,
    };
  });
}

registerForms({
  'proposal:save': async (form, values) => {
    requirePermission('commercial:edit');
    const to = values.text('to');
    const input: ProposalInput = {
      title: values.text('title'),
      clientId: to.startsWith('cli:') ? to.slice(4) : null,
      opportunityId: to.startsWith('opp:') ? to.slice(4) : null,
      items: readItems(form),
      validUntil: values.optional('validUntil'),
      startDate: values.optional('startDate'),
      paymentTerms: values.text('paymentTerms'),
      contractLink: values.text('contractLink'),
      notes: values.text('notes'),
    };
    const id = form.dataset.id || null;
    if (id) {
      // Ao editar, mantém o vínculo com a oportunidade de origem.
      const previous = findProposal(store().data, id);
      if (input.clientId && previous?.opportunityId) input.opportunityId = previous.opportunityId;
    }
    const proposal = await store().apply((draft, ctx) => saveProposal(draft, id, input, ctx));
    closeModal();
    toast(id ? 'Proposta atualizada.' : 'Proposta criada como rascunho.');
    if (!id) navigate(`/comercial/propostas/${proposal.id}`);
  },
  'proposal:accept': async (form, values) => {
    requirePermission('commercial:edit');
    const id = form.dataset.id!;
    const options = { createProjects: values.checked('createProjects'), createInstallments: values.checked('createInstallments') };
    const result = await store().apply((draft, ctx) => acceptProposal(draft, id, options, today(), ctx));
    closeModal();
    const parts = ['Proposta aceita!'];
    if (result.projects.length) parts.push(pluralize(result.projects.length, 'projeto criado', 'projetos criados') + '.');
    if (result.installments) parts.push(pluralize(result.installments, 'parcela registrada', 'parcelas registradas') + ' no cliente.');
    toast(parts.join(' '));
  },
});

function openAcceptModal(p: Proposal): void {
  const { data } = store();
  const hasClient = Boolean(p.clientId);
  const oneTime = proposalTotals(p).oneTime;
  openModal({
    title: 'Proposta aceita 🎉',
    description: `${proposalRecipient(data, p)} aceitou. Quer que o sistema já prepare o trabalho?`,
    body: html`
      <form class="form" data-form="proposal:accept" data-id="${p.id}">
        <label class="ck-row">
          <input type="checkbox" class="check" name="createProjects" checked />
          <span><strong>Criar ${pluralize(p.items.length, 'projeto', 'projetos')} automaticamente</strong>
            <small>${p.items.map((i) => `${i.name} (${labelOf(PROJECT_TYPES, projectTypeForCategory(i.category))})`).join(' · ')}</small></span>
        </label>
        ${oneTime > 0
          ? html`<label class="ck-row">
              <input type="checkbox" class="check" name="createInstallments" checked />
              <span><strong>Registrar as parcelas no cliente</strong>
                <small>${formatCurrency(oneTime, true)} · ${p.paymentTerms || PAYMENT_TERMS[0]} — aparecem também no Financeiro</small></span>
            </label>`
          : ''}
        ${hasClient ? '' : html`<p class="muted small">${icon('info', 13)} Como a proposta é para uma oportunidade, o cliente será cadastrado automaticamente.</p>`}
        ${formActions('Confirmar')}
      </form>
    `,
  });
}

function proposalText(data: AppData, p: Proposal): string {
  const lines = [`*${p.title}*`, `Para: ${proposalRecipient(data, p)}`, ''];
  for (const i of p.items) {
    const service = data.services.find((s) => s.id === i.serviceId);
    lines.push(`• ${i.quantity > 1 ? `${i.quantity}x ` : ''}${i.name} — ${formatCurrency(i.price * i.quantity, true)}${i.billing === 'mensal' ? '/mês' : ''}`);
    if (service?.includes) for (const l of service.includes.split('\n').filter(Boolean)) lines.push(`   – ${l}`);
  }
  lines.push('', `*Total: ${totalsText(p)}*`);
  if (p.paymentTerms) lines.push(`Pagamento: ${p.paymentTerms}`);
  if (p.validUntil) lines.push(`Proposta válida até ${formatShortDate(p.validUntil)}.`);
  if (p.notes) lines.push('', p.notes);
  return lines.join('\n');
}

registerActions({
  'proposal:new': () => openProposalForm(),
  'proposal:edit': (el) => {
    const p = findProposal(store().data, el.dataset.id);
    if (p) openProposalForm(p);
  },
  'proposal:recalc': (el) => {
    const form = el.closest('form') ?? (el as HTMLFormElement);
    let oneTime = 0;
    let monthly = 0;
    form.querySelectorAll<HTMLElement>('[data-service-row]').forEach((row) => {
      const check = row.querySelector<HTMLInputElement>('input[name="svc"]')!;
      row.classList.toggle('is-on', check.checked);
      if (!check.checked) return;
      const qty = Math.max(1, Number(row.querySelector<HTMLInputElement>('input[name^="qty:"]')!.value) || 1);
      const priceInput = row.querySelector<HTMLInputElement>('input[name^="price:"]')!;
      const price = parseMoney(priceInput.value) ?? 0;
      if (priceInput.dataset.billing === 'mensal') monthly += price * qty;
      else oneTime += price * qty;
    });
    const out = form.querySelector('[data-proposal-total]');
    if (out) out.textContent = `Total: ${[oneTime || !monthly ? formatCurrency(oneTime, true) : '', monthly ? `${formatCurrency(monthly, true)}/mês` : ''].filter(Boolean).join(' + ')}`;
  },
  'proposal:status': async (el) => {
    requirePermission('commercial:edit');
    const id = el.dataset.id!;
    const status = el.dataset.value as ProposalStatus;
    const p = findProposal(store().data, id);
    if (!p || p.status === status) return;
    if (status === 'aceita') return openAcceptModal(p);
    await store().apply((draft) => setProposalStatus(draft, id, status, today()));
    toast(`Proposta marcada como "${labelOf(PROPOSAL_STATUSES, status)}".`);
  },
  'proposal:copy': async (el) => {
    const p = findProposal(store().data, el.dataset.id);
    if (!p) return;
    try {
      await navigator.clipboard.writeText(proposalText(store().data, p));
      toast('Texto da proposta copiado. É só colar no WhatsApp.');
    } catch {
      toast('Não foi possível copiar automaticamente neste navegador.', 'error');
    }
  },
  'proposal:delete': async (el) => {
    const ok = await confirmAction({ title: 'Excluir proposta', text: 'A proposta será apagada. Projetos e parcelas já criados a partir dela continuam.', confirmLabel: 'Excluir' });
    if (!ok) return;
    await store().apply((draft) => deleteProposal(draft, el.dataset.id!));
    toast('Proposta excluída.');
    navigate('/comercial/propostas');
  },
  'proposals:status': (el) => {
    ui.status = el.dataset.value as typeof ui.status;
    rerender();
  },
});

// ---------------------------------------------------------------- Lista

export function renderProposals(): SafeHtml {
  const { data } = store();
  const t = today();
  const month = monthKey(t);
  const list = [...data.proposals]
    .filter((p) => ui.status === 'todas' || p.status === ui.status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sent = data.proposals.filter((p) => p.status === 'enviada');
  const finance = allowed('finance:view');
  const openValue = sent.reduce((sum, p) => sum + proposalTotals(p).oneTime, 0);
  const acceptedMonth = data.proposals.filter((p) => p.status === 'aceita' && p.decidedAt?.startsWith(month)).length;
  const sentMonth = data.proposals.filter((p) => p.sentAt?.startsWith(month)).length;

  return html`
    ${pageHeader({
      title: 'Comercial',
      subtitle: `${pluralize(sent.length, 'proposta aguardando resposta', 'propostas aguardando resposta')}`,
      actions: button({ label: 'Nova proposta', action: 'proposal:new', variant: 'primary', icon: 'plus' }),
    })}
    ${commercialTabs('propostas')}
    <div class="stats stats--compact">
      ${statCard({ label: 'Aguardando resposta', value: String(sent.length), tone: sent.length ? 'warning' : undefined })}
      ${finance ? statCard({ label: 'Valor em propostas enviadas', value: formatCurrency(openValue), hint: 'Só valores únicos (sem mensalidades)' }) : ''}
      ${statCard({ label: 'Enviadas no mês', value: String(sentMonth) })}
      ${statCard({ label: 'Aceitas no mês', value: String(acceptedMonth), tone: acceptedMonth ? 'success' : undefined })}
    </div>
    <div class="toolbar">
      ${segmented({
        label: 'Filtrar por status',
        action: 'proposals:status',
        value: ui.status,
        items: [{ value: 'todas', label: 'Todas', count: data.proposals.length }, ...PROPOSAL_STATUSES.map((s) => ({ value: s.value, label: s.label, count: data.proposals.filter((p) => p.status === s.value).length }))],
      })}
    </div>
    ${list.length
      ? html`<div class="table-wrap"><table class="table">
          <thead><tr><th>Proposta</th><th>Status</th>${finance ? html`<th class="num">Total</th>` : ''}<th>Enviada</th><th>Válida até</th></tr></thead>
          <tbody>${list.map(
            (p) => html`<tr>
              <td class="cell-main"><a href="#/comercial/propostas/${p.id}">${p.title}</a> ${demoTag(p)}<span class="cell-sub">${proposalRecipient(data, p)} · ${p.items.map((i) => i.name).join(', ')}</span></td>
              <td data-label="Status">${badge(labelOf(PROPOSAL_STATUSES, p.status), toneOf(PROPOSAL_STATUSES, p.status))}</td>
              ${finance ? html`<td data-label="Total" class="num">${totalsText(p)}</td>` : ''}
              <td data-label="Enviada">${p.sentAt ? formatShortDate(p.sentAt) : html`<span class="muted">—</span>`}</td>
              <td data-label="Válida até">${p.validUntil ? html`<span class="${cx(p.status === 'enviada' && p.validUntil < t && 'text-danger')}">${formatShortDate(p.validUntil)}</span>` : html`<span class="muted">—</span>`}</td>
            </tr>`,
          )}</tbody>
        </table></div>`
      : html`<div class="panel">${emptyState({
          icon: 'file',
          title: data.proposals.length ? 'Nenhuma proposta neste filtro' : 'Nenhuma proposta ainda',
          text: data.proposals.length ? undefined : 'Monte propostas com os serviços do catálogo. Quando forem aceitas, o sistema cria os projetos para você.',
          action: data.proposals.length ? undefined : button({ label: 'Nova proposta', action: 'proposal:new', variant: 'primary', icon: 'plus' }),
        })}</div>`}
  `;
}

// ---------------------------------------------------------------- Detalhe

export function renderProposalDetail(p: Proposal): SafeHtml {
  const { data } = store();
  const finance = allowed('finance:view');
  const totals = proposalTotals(p);
  const client = data.clients.find((c) => c.id === p.clientId);
  const opp = data.opportunities.find((o) => o.id === p.opportunityId);
  const projects = data.projects.filter((x) => p.projectIds.includes(x.id));

  return html`
    ${pageHeader({
      title: p.title,
      back: { href: '#/comercial/propostas', label: 'Propostas' },
      subtitle: html`${badge(labelOf(PROPOSAL_STATUSES, p.status), toneOf(PROPOSAL_STATUSES, p.status))} ${demoTag(p)}
        ${client ? html`<a href="#/clientes/${client.id}">${client.company}</a>` : opp ? html`<a href="#/comercial/${opp.id}">${opp.company}</a>` : ''}`,
      actions: html`
        ${button({ label: 'Copiar texto', action: 'proposal:copy', icon: 'copy', data: { id: p.id } })}
        ${button({ label: 'Editar', action: 'proposal:edit', icon: 'edit', data: { id: p.id } })}`,
    })}

    <div class="panel proposal-status">
      <span class="project-summary__label">Status da proposta</span>
      <div class="segmented" role="tablist" aria-label="Status da proposta">
        ${PROPOSAL_STATUSES.map(
          (s) => html`<button type="button" role="tab" class="${cx('segmented__item', s.value === p.status && 'is-active')}" aria-selected="${s.value === p.status ? 'true' : 'false'}"
            data-action="proposal:status" data-id="${p.id}" data-value="${s.value}"><span>${s.label}</span></button>`,
        )}
      </div>
      <span class="muted small">${p.sentAt ? `Enviada em ${formatShortDate(p.sentAt)}` : 'Ainda não enviada'}${p.decidedAt ? ` · ${labelOf(PROPOSAL_STATUSES, p.status)} em ${formatShortDate(p.decidedAt)}` : ''}</span>
    </div>

    <div class="detail-grid">
      <div class="detail-grid__main">
        ${panel({
          title: 'Serviços',
          icon: 'tag',
          body: html`<div class="table-wrap table-wrap--flat"><table class="table">
            <thead><tr><th>Serviço</th><th class="num">Qtd.</th>${finance ? html`<th class="num">Valor</th><th class="num">Subtotal</th>` : ''}</tr></thead>
            <tbody>${p.items.map(
              (i) => html`<tr>
                <td class="cell-main">${i.name}<span class="cell-sub">${labelOf(SERVICE_CATEGORIES, i.category)} · ${i.billing === 'mensal' ? 'mensal' : 'pagamento único'}</span></td>
                <td data-label="Qtd." class="num">${i.quantity}</td>
                ${finance ? html`<td data-label="Valor" class="num">${formatCurrency(i.price, true)}</td><td data-label="Subtotal" class="num">${formatCurrency(i.price * i.quantity, true)}${i.billing === 'mensal' ? '/mês' : ''}</td>` : ''}
              </tr>`,
            )}</tbody>
          </table></div>
          ${finance
            ? html`<div class="finance-summary finance-summary--2">
                <div><span>Pagamento único</span><strong>${formatCurrency(totals.oneTime, true)}</strong></div>
                <div><span>Mensalidade</span><strong>${totals.monthly ? `${formatCurrency(totals.monthly, true)}/mês` : '—'}</strong></div>
              </div>`
            : ''}`,
        })}
        ${p.notes ? panel({ title: 'Observações', body: html`<p>${multiline(p.notes)}</p>` }) : ''}
        ${projects.length
          ? panel({
              title: 'Projetos criados',
              icon: 'projects',
              count: projects.length,
              body: html`<ul class="link-list">${projects.map((x) => html`<li><a href="#/projetos/${x.id}">${x.name}</a> ${badge(labelOf(PROJECT_TYPES, x.type), toneOf(PROJECT_TYPES, x.type))}</li>`)}</ul>`,
            })
          : ''}
      </div>
      <aside class="detail-grid__side">
        ${panel({
          title: 'Contrato',
          icon: 'file',
          action: button({ label: 'Editar contrato', iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', action: 'proposal:edit', data: { id: p.id } }),
          body: html`<dl class="info info--stack">
            <div class="info__item"><dt>Contrato assinado (PDF)</dt><dd>${p.contractLink ? externalLink(p.contractLink, 'Abrir contrato') : html`<span class="muted">Não anexado</span>`}</dd></div>
            <div class="info__item"><dt>Data de início</dt><dd>${p.startDate ? formatLongDate(p.startDate) : html`<span class="muted">Não definida</span>`}</dd></div>
            <div class="info__item"><dt>Forma de pagamento</dt><dd>${p.paymentTerms || html`<span class="muted">Não definida</span>`}</dd></div>
            <div class="info__item"><dt>Válida até</dt><dd>${p.validUntil ? formatLongDate(p.validUntil) : html`<span class="muted">Sem validade</span>`}</dd></div>
          </dl>`,
        })}
        <div class="danger-zone">
          ${button({ label: 'Excluir proposta', action: 'proposal:delete', variant: 'ghost', icon: 'trash', size: 'sm', data: { id: p.id } })}
        </div>
      </aside>
    </div>
  `;
}
