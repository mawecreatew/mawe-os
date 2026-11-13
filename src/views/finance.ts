/** Financeiro: tudo que entra e sai da conta da agência, despesas recorrentes e resumo do mês. */
import { addDays, formatShortDate, monthKey, monthLabel, relativeDay, shiftMonth, type ISODate } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney, pluralize } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import {
  cashPosition,
  deleteFinanceEntry,
  deleteRecurring,
  deleteReserve,
  financeMovements,
  isWithdrawal,
  monthByMonth,
  monthMovements,
  moveReserve,
  paySubscription,
  periodRange,
  reserveBalances,
  saveReserve,
  setOpeningBalance,
  payRecurringOccurrence,
  recurringDates,
  saveFinanceEntry,
  saveRecurring,
  summarizeMovements,
  toggleFinanceEntryPaid,
  upcomingBills,
  usedCategories,
  type FinanceEntryInput,
  type Movement,
  type RecurringInput,
} from '../domain/finance.ts';
import { CLIENT_INCOME_CATEGORY, WITHDRAWAL_CATEGORY } from '../domain/labels.ts';
import { categoryNames } from '../domain/categories.ts';
import { toggleInstallmentPaid } from '../domain/operations.ts';
import { teamMembers } from '../domain/people.ts';
import type { AppData, FinanceEntry, Payer, RecurringExpense } from '../domain/types.ts';
import { allowed, requirePermission, rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, demoTag, emptyState, notice, pageHeader, panel, segmented, statCard } from '../ui/components.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

type FinancePeriod = 'mes' | '7d' | '30d' | '12m' | 'tudo';

const ui = {
  month: null as string | null,
  period: 'mes' as FinancePeriod,
  category: '',
  kind: 'todos' as 'todos' | 'entrada' | 'saida',
  tab: 'movimentos' as 'movimentos' | 'meses' | 'recorrentes' | 'reservas',
};

const PERIODS: Array<{ value: FinancePeriod; label: string }> = [
  { value: 'mes', label: 'Mês' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: '12m', label: '12 meses' },
  { value: 'tudo', label: 'Desde o início' },
];

/** Intervalo dos lançamentos mostrados: o mês escolhido ou um período até hoje. */
function currentRange(): { from: ISODate; to: ISODate; label: string } {
  const t = today();
  if (ui.period === 'mes') {
    const month = currentMonthKey();
    return { from: `${month}-01`, to: `${month}-31`, label: monthLabel(month) };
  }
  if (ui.period === 'tudo') return { from: cashPosition(store().data, t).since, to: addDays(t, 31), label: 'desde o início' };
  const range = periodRange(ui.period, t);
  return { ...range, label: PERIODS.find((p) => p.value === ui.period)!.label.toLowerCase() };
}

function currentMonthKey(): string {
  return ui.month ?? monthKey(today());
}

function payerOptions(data: AppData) {
  return [{ value: 'agencia', label: 'Conta da agência' }, ...teamMembers(data).map((u) => ({ value: u.id, label: `Do bolso: ${u.shortName}` }))];
}

function payerName(data: AppData, payer: Payer): string {
  if (payer === 'agencia') return 'Agência';
  return data.users.find((u) => u.id === payer)?.shortName ?? '—';
}

// ---------------------------------------------------------------- Formulários

function openEntryForm(kind: 'entrada' | 'saida', entry?: FinanceEntry): void {
  const { data } = store();
  const v: FinanceEntryInput = entry ?? {
    kind,
    description: '',
    amount: 0,
    dueDate: today(),
    paidAt: null,
    category: categoryNames(data, kind === 'saida' ? 'despesa' : 'receita')[0] ?? 'Outros',
    paidBy: 'agencia',
    clientId: null,
    notes: '',
  };
  const categories = categoryNames(data, v.kind === 'saida' ? 'despesa' : 'receita', v.category).filter((c) => c !== WITHDRAWAL_CATEGORY);
  openModal({
    title: entry ? 'Editar lançamento' : v.kind === 'saida' ? 'Nova despesa' : 'Nova entrada avulsa',
    description: v.kind === 'entrada' && !entry ? 'Pagamentos de clientes já aparecem sozinhos (vêm das parcelas em Clientes). Use aqui para outras entradas.' : undefined,
    body: html`
      <form class="form" data-form="finance:save" data-id="${entry?.id ?? ''}" data-kind="${v.kind}">
        ${textField({ name: 'description', label: 'Descrição', value: v.description, required: true, autofocus: true, placeholder: v.kind === 'saida' ? 'Ex.: Registro do domínio' : 'Ex.: Arte avulsa' })}
        <div class="form-grid">
          ${textField({ name: 'amount', label: 'Valor (R$)', value: entry ? String(v.amount).replace('.', ',') : '', required: true, inputmode: 'decimal', placeholder: '0,00' })}
          ${selectField({ name: 'category', label: 'Categoria', value: v.category, options: categories.map((c) => ({ value: c, label: c })) })}
          ${textField({ name: 'dueDate', label: v.kind === 'saida' ? 'Vencimento' : 'Data prevista', type: 'date', value: v.dueDate, required: true })}
          ${selectField({
            name: 'situation',
            label: 'Situação',
            value: v.paidAt ? 'pago' : 'aberto',
            options: v.kind === 'saida' ? [{ value: 'aberto', label: 'A pagar' }, { value: 'pago', label: 'Paga' }] : [{ value: 'aberto', label: 'A receber' }, { value: 'pago', label: 'Recebida' }],
          })}
          ${v.kind === 'saida' ? selectField({ name: 'paidBy', label: 'Quem pagou', value: v.paidBy, options: payerOptions(data), hint: 'Marque o sócio quando sair do bolso de um de vocês.' }) : ''}
          ${selectField({ name: 'clientId', label: 'Cliente (opcional)', value: v.clientId ?? '', emptyLabel: 'Nenhum', options: data.clients.map((c) => ({ value: c.id, label: c.company })) })}
        </div>
        ${textareaField({ name: 'notes', label: 'Observações', value: v.notes, rows: 2 })}
        ${formActions(
          entry ? 'Salvar' : 'Lançar',
          entry && entry.kind === 'saida' && !entry.recurringId
            ? button({ label: 'É retirada de lucro', action: 'finance:to-withdrawal', icon: 'user', variant: 'ghost', size: 'sm', data: { id: entry.id } })
            : undefined,
        )}
      </form>
    `,
  });
}

/** Retirada de lucro: dinheiro que sai da agência para um sócio. Não é despesa. */
function openWithdrawalForm(entry?: FinanceEntry): void {
  const { data } = store();
  const partners = teamMembers(data);
  const editing = entry && isWithdrawal(entry);
  const recipient = entry && entry.paidBy !== 'agencia' ? entry.paidBy : (partners[0]?.id ?? '');
  openModal({
    title: editing ? 'Editar retirada' : 'Retirada dos sócios',
    description: 'O lucro que vocês tiram da agência. Não conta como despesa: aparece separado no resumo do mês.',
    body: html`
      <form class="form" data-form="finance:withdrawal" data-id="${entry?.id ?? ''}">
        ${textField({ name: 'description', label: 'Descrição', value: entry?.description ?? 'Retirada de lucro', required: true, autofocus: true })}
        <div class="form-grid">
          ${textField({ name: 'amount', label: 'Valor (R$)', value: entry ? String(entry.amount).replace('.', ',') : '', required: true, inputmode: 'decimal', placeholder: '0,00' })}
          ${selectField({ name: 'paidBy', label: 'Para quem', value: recipient, options: partners.map((u) => ({ value: u.id, label: u.shortName })), hint: 'Se for para os dois, lance uma retirada para cada um.' })}
          ${textField({ name: 'dueDate', label: 'Data', type: 'date', value: entry?.dueDate ?? today(), required: true })}
          ${selectField({
            name: 'situation',
            label: 'Situação',
            value: !entry || entry.paidAt ? 'pago' : 'aberto',
            options: [{ value: 'pago', label: 'Já retirado' }, { value: 'aberto', label: 'Combinado, ainda não retirado' }],
          })}
        </div>
        ${textareaField({ name: 'notes', label: 'Observações', value: entry?.notes ?? '', rows: 2 })}
        ${formActions(entry ? 'Salvar' : 'Registrar retirada')}
      </form>
    `,
  });
}

function openRecurringForm(rec?: RecurringExpense): void {
  const { data } = store();
  const v: RecurringInput = rec ?? { description: '', amount: 0, category: 'Ferramentas', frequency: 'mensal', startDate: today(), paidBy: 'agencia', active: true };
  openModal({
    title: rec ? 'Editar despesa recorrente' : 'Nova despesa recorrente',
    description: 'Cadastre uma vez: o sistema gera o vencimento todo mês (ou todo ano) sozinho. É só marcar como paga quando pagar.',
    body: html`
      <form class="form" data-form="recurring:save" data-id="${rec?.id ?? ''}">
        ${textField({ name: 'description', label: 'Descrição', value: v.description, required: true, autofocus: true, placeholder: 'Ex.: Claude Pro, Supabase, domínio' })}
        <div class="form-grid">
          ${textField({ name: 'amount', label: 'Valor (R$)', value: rec ? String(v.amount).replace('.', ',') : '', required: true, inputmode: 'decimal' })}
          ${selectField({ name: 'frequency', label: 'Repete', value: v.frequency, options: [{ value: 'mensal', label: 'Todo mês' }, { value: 'anual', label: 'Todo ano' }] })}
          ${textField({ name: 'startDate', label: 'Primeiro vencimento', type: 'date', value: v.startDate, required: true, hint: 'Os próximos caem no mesmo dia.' })}
          ${selectField({ name: 'category', label: 'Categoria', value: v.category, options: categoryNames(data, 'despesa', v.category).map((c) => ({ value: c, label: c })) })}
          ${selectField({ name: 'paidBy', label: 'Quem paga', value: v.paidBy, options: payerOptions(data) })}
          ${selectField({ name: 'active', label: 'Situação', value: v.active ? 'sim' : 'nao', options: [{ value: 'sim', label: 'Ativa' }, { value: 'nao', label: 'Pausada (não gera vencimentos)' }] })}
        </div>
        ${formActions(rec ? 'Salvar' : 'Cadastrar')}
      </form>
    `,
  });
}

function readAmount(text: string): number {
  const amount = parseMoney(text);
  if (amount === null || amount <= 0) throw new Error('Informe um valor maior que zero.');
  return amount;
}

function openOpeningForm(): void {
  const current = store().data.finance.openingBalance;
  openModal({
    title: 'Saldo inicial da conta',
    description: 'Quanto já tinha na conta da agência antes de vocês começarem a lançar no sistema. Deixe zero se começaram do zero.',
    body: html`
      <form class="form" data-form="finance:opening">
        <div class="form-grid">
          ${textField({ name: 'amount', label: 'Valor (R$)', value: current ? String(current.amount).replace('.', ',') : '', inputmode: 'decimal', autofocus: true, placeholder: '0,00' })}
          ${textField({ name: 'date', label: 'Em que dia', type: 'date', value: current?.date ?? '2026-10-01', required: true })}
        </div>
        ${formActions('Salvar saldo inicial')}
      </form>`,
  });
}

function openReserveForm(id?: string): void {
  const reserve = store().data.finance.reserves?.find((r) => r.id === id);
  openModal({
    title: reserve ? 'Editar reserva' : 'Nova reserva',
    description: 'Uma "caixinha" dentro do caixa: o dinheiro continua na conta, mas fica separado para um fim (ex.: ferramentas, impostos, equipamento).',
    body: html`
      <form class="form" data-form="reserve:save" data-id="${reserve?.id ?? ''}">
        <div class="form-grid">
          ${textField({ name: 'name', label: 'Nome', value: reserve?.name ?? '', required: true, autofocus: true, placeholder: 'Ex.: Ferramentas (Canva, Claude)' })}
          ${textField({ name: 'goal', label: 'Meta (opcional, R$)', value: reserve?.goal ? String(reserve.goal).replace('.', ',') : '', inputmode: 'decimal' })}
        </div>
        ${formActions(reserve ? 'Salvar' : 'Criar reserva')}
      </form>`,
  });
}

function openReserveMoveForm(id: string, direction: 1 | -1): void {
  const reserve = store().data.finance.reserves?.find((r) => r.id === id);
  if (!reserve) return;
  openModal({
    title: direction > 0 ? `Guardar em "${reserve.name}"` : `Tirar de "${reserve.name}"`,
    body: html`
      <form class="form" data-form="reserve:move" data-id="${reserve.id}" data-direction="${direction}">
        <div class="form-grid">
          ${textField({ name: 'amount', label: 'Valor (R$)', required: true, inputmode: 'decimal', autofocus: true })}
          ${textField({ name: 'date', label: 'Data', type: 'date', value: today(), required: true })}
        </div>
        ${textField({ name: 'note', label: 'Anotação (opcional)', placeholder: direction > 0 ? 'Ex.: sobra de novembro' : 'Ex.: assinatura do Canva Pro' })}
        ${formActions(direction > 0 ? 'Guardar' : 'Tirar')}
      </form>`,
  });
}

registerForms({
  'finance:opening': async (_form, values) => {
    requirePermission('finance:edit');
    const amount = parseMoney(values.text('amount'));
    await store().apply((draft) => setOpeningBalance(draft, amount, values.text('date')));
    closeModal();
    toast('Saldo inicial salvo.');
  },
  'reserve:save': async (form, values) => {
    requirePermission('finance:edit');
    const goal = parseMoney(values.text('goal'));
    await store().apply((draft, ctx) => saveReserve(draft, form.dataset.id || null, { name: values.text('name'), goal }, ctx));
    closeModal();
    toast('Reserva salva.');
  },
  'reserve:move': async (form, values) => {
    requirePermission('finance:edit');
    const amount = readAmount(values.text('amount')) * Number(form.dataset.direction);
    await store().apply((draft, ctx) => moveReserve(draft, form.dataset.id!, amount, values.text('date'), values.text('note'), ctx));
    closeModal();
    toast(amount > 0 ? 'Valor guardado na reserva.' : 'Valor tirado da reserva.');
  },
  'finance:save': async (form, values) => {
    requirePermission('finance:edit');
    const kind = form.dataset.kind as 'entrada' | 'saida';
    const dueDate = values.text('dueDate');
    const id = form.dataset.id || null;
    const previous = id ? store().data.finance.entries.find((e) => e.id === id) : undefined;
    const paid = values.text('situation') === 'pago';
    const input: FinanceEntryInput = {
      kind,
      description: values.text('description'),
      amount: readAmount(values.text('amount')),
      dueDate,
      paidAt: paid ? (previous?.paidAt ?? (dueDate < today() ? dueDate : today())) : null,
      category: values.text('category'),
      paidBy: (values.text('paidBy') || 'agencia') as Payer,
      clientId: values.optional('clientId'),
      notes: values.text('notes'),
    };
    await store().apply((draft, ctx) => saveFinanceEntry(draft, id, input, ctx));
    closeModal();
    toast(id ? 'Lançamento atualizado.' : kind === 'saida' ? 'Despesa lançada.' : 'Entrada lançada.');
  },
  'finance:withdrawal': async (form, values) => {
    requirePermission('finance:edit');
    const dueDate = values.text('dueDate');
    const id = form.dataset.id || null;
    const previous = id ? store().data.finance.entries.find((e) => e.id === id) : undefined;
    const paid = values.text('situation') === 'pago';
    const input: FinanceEntryInput = {
      kind: 'saida',
      description: values.text('description'),
      amount: readAmount(values.text('amount')),
      dueDate,
      paidAt: paid ? (previous?.paidAt ?? dueDate) : null,
      category: WITHDRAWAL_CATEGORY,
      paidBy: values.text('paidBy') as Payer,
      clientId: null,
      notes: values.text('notes'),
    };
    await store().apply((draft, ctx) => saveFinanceEntry(draft, id, input, ctx));
    closeModal();
    toast(id ? 'Retirada salva.' : 'Retirada registrada.');
  },
  'recurring:save': async (form, values) => {
    requirePermission('finance:edit');
    const input: RecurringInput = {
      description: values.text('description'),
      amount: readAmount(values.text('amount')),
      frequency: values.text('frequency') as 'mensal' | 'anual',
      startDate: values.text('startDate'),
      category: values.text('category'),
      paidBy: values.text('paidBy') as Payer,
      active: values.text('active') !== 'nao',
    };
    const id = form.dataset.id || null;
    await store().apply((draft, ctx) => saveRecurring(draft, id, input, ctx));
    closeModal();
    toast(id ? 'Despesa recorrente atualizada.' : 'Despesa recorrente cadastrada.');
  },
});

/** Marca/desmarca um movimento como pago, seja qual for a origem. */
async function toggleMovement(key: string): Promise<void> {
  requirePermission('finance:edit');
  const [source, a, b, c] = key.split(':');
  const t = today();
  if (source === 's') await store().apply((draft, ctx) => paySubscription(draft, a, b, c, t, ctx));
  else if (source === 'e') await store().apply((draft) => toggleFinanceEntryPaid(draft, a, t));
  else if (source === 'r') await store().apply((draft, ctx) => payRecurringOccurrence(draft, a, b, t, ctx));
  else if (source === 'i') {
    const client = store().data.clients.find((c) => c.installments.some((i) => i.id === a));
    if (client) await store().apply((draft) => toggleInstallmentPaid(draft, client.id, a, t));
  }
}

registerActions({
  'finance:new-in': () => openEntryForm('entrada'),
  'finance:opening': () => openOpeningForm(),
  'finance:period': (el) => {
    ui.period = el.dataset.value as FinancePeriod;
    rerender();
  },
  'reserve:new': () => openReserveForm(),
  'reserve:edit': (el) => openReserveForm(el.dataset.id),
  'reserve:in': (el) => openReserveMoveForm(el.dataset.id!, 1),
  'reserve:out': (el) => openReserveMoveForm(el.dataset.id!, -1),
  'reserve:delete': async (el) => {
    requirePermission('finance:edit');
    const ok = await confirmAction({ title: 'Excluir reserva', text: 'O dinheiro separado volta a contar como livre no caixa. Nada sai da conta.', confirmLabel: 'Excluir' });
    if (!ok) return;
    await store().apply((draft) => deleteReserve(draft, el.dataset.id!));
    toast('Reserva excluída.');
  },
  'finance:new-out': () => openEntryForm('saida'),
  'finance:new-recurring': () => openRecurringForm(),
  'finance:new-withdrawal': () => openWithdrawalForm(),
  'finance:to-withdrawal': (el) => {
    const entry = store().data.finance.entries.find((e) => e.id === el.dataset.id);
    if (!entry) return;
    closeModal();
    openWithdrawalForm(entry);
  },
  'finance:toggle': async (el) => {
    await toggleMovement(el.dataset.key!);
  },
  'finance:edit': (el) => {
    const entry = store().data.finance.entries.find((e) => e.id === el.dataset.id);
    if (entry && isWithdrawal(entry)) openWithdrawalForm(entry);
    else if (entry) openEntryForm(entry.kind, entry);
  },
  'finance:delete': async (el) => {
    requirePermission('finance:edit');
    const ok = await confirmAction({ title: 'Excluir lançamento', text: 'Este lançamento será apagado do financeiro.', confirmLabel: 'Excluir' });
    if (!ok) return;
    await store().apply((draft) => deleteFinanceEntry(draft, el.dataset.id!));
    toast('Lançamento excluído.');
  },
  'recurring:edit': (el) => {
    const rec = store().data.finance.recurring.find((r) => r.id === el.dataset.id);
    if (rec) openRecurringForm(rec);
  },
  'recurring:delete': async (el) => {
    requirePermission('finance:edit');
    const ok = await confirmAction({ title: 'Excluir despesa recorrente', text: 'Os próximos vencimentos deixam de ser gerados. Os pagamentos já registrados continuam no histórico.', confirmLabel: 'Excluir' });
    if (!ok) return;
    await store().apply((draft) => deleteRecurring(draft, el.dataset.id!));
    toast('Despesa recorrente excluída.');
  },
  'finance:prev': () => {
    ui.month = shiftMonth(currentMonthKey(), -1);
    rerender();
  },
  'finance:next': () => {
    ui.month = shiftMonth(currentMonthKey(), 1);
    rerender();
  },
  'finance:this-month': () => {
    ui.month = null;
    rerender();
  },
  'finance:category': (el) => {
    ui.category = (el as HTMLSelectElement).value;
    rerender();
  },
  'finance:kind': (el) => {
    ui.kind = el.dataset.value as typeof ui.kind;
    rerender();
  },
  'finance:tab': (el) => {
    ui.tab = el.dataset.value as typeof ui.tab;
    rerender();
  },
});

// ---------------------------------------------------------------- Renderização

function movementRow(data: AppData, m: Movement): SafeHtml {
  const t = today();
  const canEdit = allowed('finance:edit');
  const overdue = !m.paidAt && m.dueDate < t;
  const client = m.clientId ? data.clients.find((c) => c.id === m.clientId) : undefined;
  const entry = m.entryId ? data.finance.entries.find((e) => e.id === m.entryId) : undefined;
  const withdrawal = isWithdrawal(m);
  const paidLabel = m.kind === 'entrada' ? 'Recebida' : withdrawal ? 'Retirado' : 'Paga';
  return html`<li class="${cx('movement', m.paidAt && 'is-paid', overdue && 'is-overdue')}">
    <input type="checkbox" class="check" ${m.paidAt ? 'checked' : ''} ${canEdit ? '' : 'disabled'} data-change="finance:toggle" data-key="${m.key}"
      aria-label="${m.paidAt ? 'Desmarcar' : 'Marcar como'} ${m.kind === 'entrada' ? 'recebida' : 'paga'}: ${m.description}" />
    <span class="${cx('movement__kind', m.kind === 'entrada' ? 'is-in' : withdrawal ? 'is-withdrawal' : 'is-out')}" aria-hidden="true">${icon(m.kind === 'entrada' ? 'arrowDown' : withdrawal ? 'user' : 'arrowUp', 14)}</span>
    <div class="movement__main">
      <span class="movement__title">${m.description} ${entry ? demoTag(entry) : ''}</span>
      <span class="movement__meta">
        ${m.category}
        ${m.source === 'installment'
          ? html` · <a href="#/clientes/${m.clientId}">parcela em Clientes</a>`
          : m.subscriptionId
            ? html` · ${icon('repeat', 12)} <a href="#/clientes/${m.clientId}">plano mensal</a>`
            : client ? html` · <a href="#/clientes/${client.id}">${client.company}</a>` : ''}
        ${m.recurringId ? html` · ${icon('repeat', 12)} recorrente` : ''}
        ${withdrawal
          ? html` · ${badge(`Para: ${payerName(data, m.paidBy)}`, 'accent')}`
          : m.kind === 'saida' && m.paidBy !== 'agencia' ? html` · ${badge(`Do bolso: ${payerName(data, m.paidBy)}`, 'warning')}` : ''}
      </span>
      <span class="${cx('movement__date', overdue && 'text-danger')}">
        ${m.paidAt ? `${paidLabel} em ${formatShortDate(m.paidAt)}` : `${m.kind === 'entrada' ? 'Previsto' : withdrawal ? 'Combinado para' : 'Vence'} ${formatShortDate(m.dueDate)} · ${relativeDay(m.dueDate, t)}`}
      </span>
    </div>
    <span class="${cx('movement__amount', m.kind === 'entrada' ? 'text-success' : withdrawal ? 'movement__amount--withdrawal' : 'movement__amount--out')}">${m.kind === 'entrada' ? '+' : '−'} ${formatCurrency(m.amount, true)}</span>
    <span class="movement__actions">
      ${canEdit && m.source === 'entry'
        ? html`${button({ label: 'Editar', iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', action: 'finance:edit', data: { id: m.entryId! } })}
            ${button({ label: 'Excluir', iconOnly: true, icon: 'trash', variant: 'ghost', size: 'sm', action: 'finance:delete', data: { id: m.entryId! } })}`
        : ''}
    </span>
  </li>`;
}

function renderMovements(data: AppData): SafeHtml {
  const month = currentMonthKey();
  const range = currentRange();
  const isMonth = ui.period === 'mes';
  const all = (isMonth ? monthMovements(data, month, ui.category || undefined) : financeMovements(data, range.from, range.to).filter((m) => !ui.category || m.category === ui.category));
  const list = ui.kind === 'todos' ? all : all.filter((m) => m.kind === ui.kind);
  const s = summarizeMovements(all);
  const partners = Object.entries(s.paidByPartner);
  const withdrawnBy = Object.entries(s.withdrawnByPartner);
  const t = today();
  const overdue = upcomingBills(data, t, 0).filter((m) => m.dueDate < t);
  const categories = usedCategories(data);

  return html`
    <div class="toolbar">
      ${segmented({ label: 'Período', action: 'finance:period', value: ui.period, items: PERIODS })}
      ${isMonth
        ? html`<div class="period-nav">
            ${button({ label: 'Mês anterior', iconOnly: true, icon: 'arrowLeft', action: 'finance:prev' })}
            <strong class="period-nav__label">${monthLabel(month)}</strong>
            ${button({ label: 'Próximo mês', iconOnly: true, icon: 'arrowRight', action: 'finance:next' })}
            ${month !== monthKey(t) ? button({ label: 'Mês atual', action: 'finance:this-month', size: 'sm', variant: 'ghost' }) : ''}
          </div>`
        : ''}
      ${segmented({ label: 'Tipo', action: 'finance:kind', value: ui.kind, items: [{ value: 'todos', label: 'Tudo' }, { value: 'entrada', label: 'Entradas' }, { value: 'saida', label: 'Saídas' }] })}
      <label class="toolbar__select">
        <span class="visually-hidden">Categoria</span>
        <select class="input select select--inline" data-change="finance:category" aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          ${categories.map((c) => html`<option value="${c}" ${ui.category === c ? 'selected' : ''}>${c}</option>`)}
        </select>
      </label>
    </div>

    <div class="stats stats--3">
      ${statCard({ label: 'Entrou', value: formatCurrency(s.received, true), hint: s.toReceive ? `+ ${formatCurrency(s.toReceive, true)} a receber` : 'Nada pendente a receber', tone: 'success' })}
      ${statCard({ label: 'Despesas', value: formatCurrency(s.paid, true), hint: s.toPay ? `+ ${formatCurrency(s.toPay, true)} a pagar` : 'Nada pendente a pagar' })}
      ${statCard({ label: isMonth ? 'Lucro do mês' : 'Lucro do período', value: formatCurrency(s.profit, true), hint: 'Entrou − despesas', tone: s.profit < 0 ? 'danger' : 'success' })}
      ${statCard({
        label: 'Retirado pelos sócios',
        value: formatCurrency(s.withdrawn, true),
        hint: withdrawnBy.length
          ? withdrawnBy.map(([id, value]) => `${payerName(data, id)}: ${formatCurrency(value, true)}`).join(' · ') + (s.toWithdraw ? ` · + ${formatCurrency(s.toWithdraw, true)} combinado` : '')
          : s.toWithdraw ? `${formatCurrency(s.toWithdraw, true)} combinado` : isMonth ? 'Nenhuma retirada no mês' : 'Nenhuma retirada no período',
        tone: 'accent',
      })}
      ${statCard({ label: isMonth ? 'Sobrou no mês' : 'Sobrou no período', value: formatCurrency(s.balance, true), hint: 'Lucro − retiradas', tone: s.balance < 0 ? 'danger' : undefined })}
      ${isMonth
        ? statCard({ label: 'Previsto até o fim do mês', value: formatCurrency(s.balance + s.toReceive - s.toPay - s.toWithdraw, true), hint: 'Se tudo for pago, recebido e retirado' })
        : statCard({ label: 'Pendente no período', value: formatCurrency(s.toReceive - s.toPay, true), hint: `${formatCurrency(s.toReceive, true)} a receber · ${formatCurrency(s.toPay, true)} a pagar` })}
    </div>

    ${overdue.length
      ? notice({ tone: 'warning', icon: 'alert', title: `${pluralize(overdue.length, 'conta vencida', 'contas vencidas')} sem baixa`, text: overdue.slice(0, 4).map((m) => `${m.description} (${formatShortDate(m.dueDate)})`).join(' · ') })
      : ''}
    ${partners.length
      ? notice({ title: 'Pago do bolso dos sócios neste mês', text: partners.map(([id, value]) => `${payerName(data, id)}: ${formatCurrency(value, true)}`).join(' · ') + ' — lembrem de acertar entre vocês.', icon: 'user' })
      : ''}

    ${panel({
      title: isMonth ? 'Lançamentos do mês' : `Lançamentos · ${range.label}`,
      icon: 'wallet',
      count: list.length,
      body: list.length
        ? html`<ul class="movements">${list.map((m) => movementRow(data, m))}</ul>`
        : emptyState({ icon: 'wallet', compact: true, title: isMonth ? 'Nada lançado neste mês' : 'Nada lançado neste período', text: 'Registre despesas e entradas avulsas. Os pagamentos de clientes e os planos mensais aparecem sozinhos.' }),
    })}
  `;
}

/** Faixa do topo: quanto tem na conta hoje, somando todos os meses. */
function renderCash(data: AppData): SafeHtml {
  const cash = cashPosition(data, today());
  const canEdit = allowed('finance:edit');
  return html`<section class="cash-bar">
    <div class="cash-bar__main">
      <span class="cash-bar__label">${icon('wallet', 15)} Caixa atual da agência</span>
      <strong class="${cx('cash-bar__value', cash.balance < 0 && 'text-danger')}">${formatCurrency(cash.balance, true)}</strong>
      <span class="cash-bar__hint">Soma de todos os meses desde ${formatShortDate(cash.since)}${cash.opening ? ` · com saldo inicial de ${formatCurrency(cash.opening, true)}` : ''}</span>
    </div>
    <dl class="cash-bar__parts">
      <div><dt>Entrou</dt><dd class="text-success">+ ${formatCurrency(cash.received, true)}</dd></div>
      <div><dt>Despesas pela conta</dt><dd>− ${formatCurrency(cash.paid, true)}</dd></div>
      <div><dt>Retiradas</dt><dd>− ${formatCurrency(cash.withdrawn, true)}</dd></div>
      ${cash.reserved ? html`<div><dt>Em reservas</dt><dd>${formatCurrency(cash.reserved, true)}</dd></div><div><dt>Livre para usar</dt><dd><strong>${formatCurrency(cash.free, true)}</strong></dd></div>` : ''}
    </dl>
    ${canEdit ? html`<button type="button" class="link-button cash-bar__link" data-action="finance:opening">${cash.opening ? 'Editar saldo inicial' : 'Já tinha dinheiro antes? Informe o saldo inicial'}</button>` : ''}
  </section>`;
}

function renderMonths(data: AppData): SafeHtml {
  const rows = monthByMonth(data, today());
  const max = Math.max(1, ...rows.map((r) => Math.max(r.received, r.paid)));
  return html`
    <p class="section-intro">Cada mês: o que entrou, o que saiu e quanto ficou. A última coluna é o caixa acumulado no fim de cada mês, somando tudo desde o início.</p>
    ${rows.length
      ? html`<div class="table-wrap"><table class="table">
          <thead><tr><th>Mês</th><th class="num">Entrou</th><th class="num">Despesas</th><th class="num">Retiradas</th><th class="num">Sobrou</th><th class="num">Caixa no fim do mês</th></tr></thead>
          <tbody>${[...rows].reverse().map(
            (r) => html`<tr>
              <td class="cell-main">${monthLabel(r.month)}<span class="month-bars" aria-hidden="true"><i class="month-bars__in" style="width: ${Math.round((r.received / max) * 100)}%"></i><i class="month-bars__out" style="width: ${Math.round((r.paid / max) * 100)}%"></i></span></td>
              <td data-label="Entrou" class="num text-success">${formatCurrency(r.received, true)}</td>
              <td data-label="Despesas" class="num">${formatCurrency(r.paid, true)}</td>
              <td data-label="Retiradas" class="num">${formatCurrency(r.withdrawn, true)}</td>
              <td data-label="Sobrou" class="${cx('num', r.result < 0 ? 'text-danger' : 'text-success')}">${r.result >= 0 ? '+' : '−'} ${formatCurrency(Math.abs(r.result), true)}</td>
              <td data-label="Caixa" class="num"><strong>${formatCurrency(r.cumulative, true)}</strong></td>
            </tr>`,
          )}</tbody>
          <tfoot><tr><td>Total</td>
            <td class="num">${formatCurrency(rows.reduce((s, r) => s + r.received, 0), true)}</td>
            <td class="num">${formatCurrency(rows.reduce((s, r) => s + r.paid, 0), true)}</td>
            <td class="num">${formatCurrency(rows.reduce((s, r) => s + r.withdrawn, 0), true)}</td>
            <td class="num">${formatCurrency(rows.reduce((s, r) => s + r.result, 0), true)}</td>
            <td class="num"><strong>${formatCurrency(rows[rows.length - 1].cumulative, true)}</strong></td></tr></tfoot>
        </table></div>`
      : html`<div class="panel">${emptyState({ icon: 'wallet', title: 'Nenhum mês com movimento ainda' })}</div>`}
  `;
}

function renderReserves(data: AppData): SafeHtml {
  const list = reserveBalances(data);
  const cash = cashPosition(data, today());
  const canEdit = allowed('finance:edit');
  return html`
    <p class="section-intro">Reservas separam parte do caixa para um fim, sem tirar da conta. Livre para usar agora: <strong>${formatCurrency(cash.free, true)}</strong>.</p>
    ${list.length
      ? html`<div class="reserve-grid">${list.map(({ reserve, balance }) => {
          const pct = reserve.goal ? Math.min(100, Math.round((balance / reserve.goal) * 100)) : null;
          const moves = (data.finance.reserveMoves ?? []).filter((m) => m.reserveId === reserve.id).slice(-3).reverse();
          return html`<article class="reserve-card">
            <header class="reserve-card__head">
              <span class="reserve-card__icon">${icon('piggy', 18)}</span>
              <strong>${reserve.name}</strong>
              ${canEdit ? html`<span class="button-row">${button({ label: 'Editar', iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', action: 'reserve:edit', data: { id: reserve.id } })}${button({ label: 'Excluir', iconOnly: true, icon: 'trash', variant: 'ghost', size: 'sm', action: 'reserve:delete', data: { id: reserve.id } })}</span>` : ''}
            </header>
            <p class="reserve-card__value">${formatCurrency(balance, true)}${reserve.goal ? html` <small>de ${formatCurrency(reserve.goal, true)}</small>` : ''}</p>
            ${pct !== null ? html`<div class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span class="progress__bar" style="width: ${pct}%"></span></div>` : ''}
            ${moves.length ? html`<ul class="reserve-card__moves">${moves.map((m) => html`<li><span>${m.note || (m.amount > 0 ? 'Guardado' : 'Retirado')}</span><span class="${m.amount > 0 ? 'text-success' : ''}">${m.amount > 0 ? '+' : '−'} ${formatCurrency(Math.abs(m.amount), true)}</span></li>`)}</ul>` : ''}
            ${canEdit ? html`<footer class="button-row">${button({ label: 'Guardar', action: 'reserve:in', icon: 'plus', size: 'sm', data: { id: reserve.id } })}${balance > 0 ? button({ label: 'Tirar', action: 'reserve:out', size: 'sm', variant: 'ghost', data: { id: reserve.id } }) : ''}</footer>` : ''}
          </article>`;
        })}</div>`
      : html`<div class="panel">${emptyState({
          icon: 'piggy',
          title: 'Nenhuma reserva ainda',
          text: 'Ex.: "Ferramentas" para pagar Canva e Claude, ou "Impostos" para o MEI.',
          action: canEdit ? button({ label: 'Nova reserva', action: 'reserve:new', variant: 'primary', icon: 'plus' }) : undefined,
        })}</div>`}
    ${list.length && canEdit ? button({ label: 'Nova reserva', action: 'reserve:new', icon: 'plus' }) : ''}
  `;
}

function renderRecurring(data: AppData): SafeHtml {
  const t = today();
  const list = [...data.finance.recurring].sort((a, b) => Number(b.active) - Number(a.active) || a.description.localeCompare(b.description));
  const monthlyTotal = list.filter((r) => r.active).reduce((sum, r) => sum + (r.frequency === 'mensal' ? r.amount : r.amount / 12), 0);
  const canEdit = allowed('finance:edit');
  return html`
    <p class="section-intro">Assinaturas e contas fixas. Custo médio por mês: <strong>${formatCurrency(monthlyTotal, true)}</strong>.</p>
    ${list.length
      ? html`<div class="table-wrap"><table class="table">
          <thead><tr><th>Despesa</th><th>Repete</th><th>Próximo vencimento</th><th>Quem paga</th><th class="num">Valor</th><th></th></tr></thead>
          <tbody>${list.map((r) => {
            const next = recurringDates(r, t, `${Number(t.slice(0, 4)) + 2}-12-31`).find((d) => !data.finance.entries.some((e) => e.recurringId === r.id && e.dueDate === d && e.paidAt));
            return html`<tr class="${cx(!r.active && 'is-muted')}">
              <td class="cell-main">${r.description} ${demoTag(r)}<span class="cell-sub">${r.category}${r.active ? '' : ' · pausada'}</span></td>
              <td data-label="Repete">${r.frequency === 'mensal' ? 'Todo mês' : 'Todo ano'}</td>
              <td data-label="Próximo">${r.active && next ? `${formatShortDate(next)} · ${relativeDay(next, t)}` : html`<span class="muted">—</span>`}</td>
              <td data-label="Quem paga">${payerName(data, r.paidBy)}</td>
              <td data-label="Valor" class="num">${formatCurrency(r.amount, true)}</td>
              <td class="cell-actions">${canEdit
                ? html`${button({ label: 'Editar', iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', action: 'recurring:edit', data: { id: r.id } })}
                    ${button({ label: 'Excluir', iconOnly: true, icon: 'trash', variant: 'ghost', size: 'sm', action: 'recurring:delete', data: { id: r.id } })}`
                : ''}</td>
            </tr>`;
          })}</tbody>
        </table></div>`
      : html`<div class="panel">${emptyState({
          icon: 'repeat',
          title: 'Nenhuma despesa recorrente',
          text: 'Cadastre assinaturas como Claude Pro, Supabase ou o domínio uma vez só.',
          action: canEdit ? button({ label: 'Nova despesa recorrente', action: 'finance:new-recurring', variant: 'primary', icon: 'plus' }) : undefined,
        })}</div>`}
  `;
}

export const financeView: View = {
  title: () => 'Financeiro',
  render: () => {
    const { data } = store();
    if (!allowed('finance:view')) {
      return html`${pageHeader({ title: 'Financeiro' })}
        <div class="panel">${notice({ title: 'Informação restrita', text: 'Seu perfil não tem acesso aos dados financeiros.', icon: 'lock' })}</div>`;
    }
    const canEdit = allowed('finance:edit');
    return html`
      ${pageHeader({
        title: 'Financeiro',
        subtitle: 'Entradas e saídas da conta da agência · registro manual, não movimenta dinheiro',
        actions: canEdit
          ? html`${button({ label: 'Despesa recorrente', action: 'finance:new-recurring', icon: 'repeat' })}
              ${button({ label: 'Retirada', action: 'finance:new-withdrawal', icon: 'user' })}
              ${button({ label: 'Nova entrada', action: 'finance:new-in', icon: 'arrowDown' })}
              ${button({ label: 'Nova despesa', action: 'finance:new-out', variant: 'primary', icon: 'plus' })}`
          : undefined,
      })}
      <div class="toolbar">
        ${segmented({
          label: 'Seção do financeiro',
          action: 'finance:tab',
          value: ui.tab,
          items: [
            { value: 'movimentos', label: 'Entradas e saídas', icon: 'wallet' },
            { value: 'meses', label: 'Mês a mês', icon: 'chart' },
            { value: 'recorrentes', label: 'Despesas recorrentes', icon: 'repeat', count: data.finance.recurring.filter((r) => r.active).length },
            { value: 'reservas', label: 'Reservas', icon: 'piggy', count: (data.finance.reserves ?? []).length },
          ],
        })}
      </div>
      ${renderCash(data)}
      ${ui.tab === 'movimentos' ? renderMovements(data) : ui.tab === 'meses' ? renderMonths(data) : ui.tab === 'reservas' ? renderReserves(data) : renderRecurring(data)}
      <p class="muted small">${icon('info', 13)} Pagamentos de clientes vêm das parcelas e dos planos mensais em Clientes (categorias "${CLIENT_INCOME_CATEGORY}" e "Plano mensal"). Marcar aqui ou lá dá no mesmo. As categorias de despesa e entrada podem ser editadas em <a href="#/categorias/despesa">Categorias</a>.</p>
    `;
  },
};
