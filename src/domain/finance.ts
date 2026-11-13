/**
 * Financeiro da agência: entradas e saídas, despesas recorrentes e resumos.
 *
 * Os pagamentos de clientes continuam sendo registrados em Clientes (parcelas)
 * e aparecem aqui automaticamente — não é preciso digitar duas vezes. As
 * despesas recorrentes geram as ocorrências de cada mês/ano sozinhas: enquanto
 * não são pagas, são calculadas na hora; ao marcar como paga, viram um
 * lançamento registrado.
 *
 * Tudo é registro manual: o Mawe OS não movimenta dinheiro.
 */
import { addDays, addMonths, daysInMonth, diffInDays, isValidISODate, monthKey, shiftMonth, type ISODate, type MonthKey } from '../core/dates.ts';
import { createId } from '../core/id.ts';
import { CLIENT_INCOME_CATEGORY, WITHDRAWAL_CATEGORY } from './labels.ts';
import type { ActionContext } from './operations.ts';
import { logActivity } from './activity.ts';
import type { AppData, Client, FinanceEntry, ID, Payer, RecurringExpense, Reserve, ReserveMove, Subscription } from './types.ts';

function mustFind<T extends { id: ID }>(list: T[], id: ID, what: string): T {
  const item = list.find((x) => x.id === id);
  if (!item) throw new Error(`${what} não encontrado(a).`);
  return item;
}

function validPayer(draft: AppData, payer: Payer): Payer {
  if (payer === 'agencia') return payer;
  if (draft.users.some((u) => u.id === payer && !u.guest)) return payer;
  throw new Error('Escolha quem pagou: a conta da agência ou um dos sócios.');
}

// ---------------------------------------------------------------- Lançamentos

export type FinanceEntryInput = Pick<FinanceEntry, 'kind' | 'description' | 'amount' | 'dueDate' | 'paidAt' | 'category' | 'paidBy' | 'clientId' | 'notes'>;

/** Retirada de lucro de um sócio (não é despesa). */
export function isWithdrawal(m: Pick<FinanceEntry, 'kind' | 'category'>): boolean {
  return m.kind === 'saida' && m.category === WITHDRAWAL_CATEGORY;
}

function checkEntry(draft: AppData, input: FinanceEntryInput): void {
  if (!input.description.trim()) throw new Error('Descreva o lançamento.');
  if (!(input.amount > 0)) throw new Error('O valor deve ser maior que zero.');
  if (!isValidISODate(input.dueDate)) throw new Error('Informe uma data válida.');
  if (input.paidAt !== null && !isValidISODate(input.paidAt)) throw new Error('Data de pagamento inválida.');
  if (input.clientId && !draft.clients.some((c) => c.id === input.clientId)) throw new Error('Cliente não encontrado.');
  validPayer(draft, input.paidBy);
  // Na retirada, `paidBy` guarda o sócio que recebeu.
  if (isWithdrawal(input) && input.paidBy === 'agencia') throw new Error('Escolha para qual sócio foi a retirada.');
}

export function saveFinanceEntry(draft: AppData, id: ID | null, input: FinanceEntryInput, ctx: ActionContext): FinanceEntry {
  checkEntry(draft, input);
  const clean = { ...input, description: input.description.trim(), notes: input.notes.trim() };
  // Entrada é sempre na conta da agência.
  if (clean.kind === 'entrada') clean.paidBy = 'agencia';
  if (id) {
    const entry = mustFind(draft.finance.entries, id, 'Lançamento');
    Object.assign(entry, clean);
    return entry;
  }
  const entry: FinanceEntry = { id: createId('fin'), ...clean, recurringId: null, subscriptionId: null, createdAt: ctx.now.toISOString() };
  draft.finance.entries.push(entry);
  logActivity(draft, ctx, `lançou ${clean.kind === 'entrada' ? 'uma entrada' : 'uma saída'}: ${clean.description}`, '#/financeiro');
  return entry;
}

export function deleteFinanceEntry(draft: AppData, id: ID): void {
  mustFind(draft.finance.entries, id, 'Lançamento');
  draft.finance.entries = draft.finance.entries.filter((e) => e.id !== id);
}

/** Marca/desmarca como pago (saída) ou recebido (entrada). */
export function toggleFinanceEntryPaid(draft: AppData, id: ID, paidOn: ISODate): void {
  const entry = mustFind(draft.finance.entries, id, 'Lançamento');
  if ((entry.recurringId || entry.subscriptionId) && entry.paidAt) {
    // Ocorrência de recorrência desmarcada: volta a ser calculada automaticamente.
    draft.finance.entries = draft.finance.entries.filter((e) => e.id !== id);
    return;
  }
  entry.paidAt = entry.paidAt ? null : paidOn;
}

// ---------------------------------------------------------------- Recorrentes

export type RecurringInput = Pick<RecurringExpense, 'description' | 'amount' | 'category' | 'frequency' | 'startDate' | 'paidBy' | 'active'>;

export function saveRecurring(draft: AppData, id: ID | null, input: RecurringInput, ctx: ActionContext): RecurringExpense {
  if (!input.description.trim()) throw new Error('Descreva a despesa.');
  if (!(input.amount > 0)) throw new Error('O valor deve ser maior que zero.');
  if (!isValidISODate(input.startDate)) throw new Error('Informe a data do primeiro vencimento.');
  validPayer(draft, input.paidBy);
  const clean = { ...input, description: input.description.trim() };
  if (id) {
    const rec = mustFind(draft.finance.recurring, id, 'Despesa recorrente');
    Object.assign(rec, clean);
    return rec;
  }
  const rec: RecurringExpense = { id: createId('rec'), ...clean, createdAt: ctx.now.toISOString() };
  draft.finance.recurring.push(rec);
  return rec;
}

/** Remove a recorrência. Os pagamentos já registrados continuam no histórico. */
export function deleteRecurring(draft: AppData, id: ID): void {
  mustFind(draft.finance.recurring, id, 'Despesa recorrente');
  draft.finance.recurring = draft.finance.recurring.filter((r) => r.id !== id);
  for (const e of draft.finance.entries) if (e.recurringId === id) e.recurringId = null;
}

/** Registra o pagamento de uma ocorrência (ex.: Supabase de novembro). */
export function payRecurringOccurrence(draft: AppData, recurringId: ID, dueDate: ISODate, paidOn: ISODate, ctx: ActionContext, paidBy?: Payer): FinanceEntry {
  const rec = mustFind(draft.finance.recurring, recurringId, 'Despesa recorrente');
  const existing = draft.finance.entries.find((e) => e.recurringId === recurringId && e.dueDate === dueDate);
  if (existing) {
    existing.paidAt = paidOn;
    return existing;
  }
  const entry: FinanceEntry = {
    id: createId('fin'),
    kind: 'saida',
    description: rec.description,
    amount: rec.amount,
    dueDate,
    paidAt: paidOn,
    category: rec.category,
    paidBy: validPayer(draft, paidBy ?? rec.paidBy),
    clientId: null,
    recurringId,
    subscriptionId: null,
    notes: '',
    createdAt: ctx.now.toISOString(),
  };
  draft.finance.entries.push(entry);
  return entry;
}

// ---------------------------------------------------------------- Planos mensais dos clientes

export type SubscriptionInput = Pick<Subscription, 'name' | 'serviceId' | 'amount' | 'billingDay' | 'startMonth' | 'endMonth' | 'active'>;

function checkSubscription(input: SubscriptionInput): void {
  if (!input.name.trim()) throw new Error('Dê um nome para o plano.');
  if (!(input.amount > 0)) throw new Error('O valor do plano deve ser maior que zero.');
  if (!Number.isInteger(input.billingDay) || input.billingDay < 1 || input.billingDay > 31) throw new Error('O dia do vencimento deve ser de 1 a 31.');
  if (!/^\d{4}-\d{2}$/.test(input.startMonth)) throw new Error('Informe o primeiro mês cobrado.');
  if (input.endMonth !== null && (!/^\d{4}-\d{2}$/.test(input.endMonth) || input.endMonth < input.startMonth)) throw new Error('O último mês precisa ser depois do primeiro.');
}

export function saveSubscription(draft: AppData, clientId: ID, id: ID | null, input: SubscriptionInput, ctx: ActionContext): Subscription {
  checkSubscription(input);
  const client = mustFind(draft.clients, clientId, 'Cliente');
  const list = (client.subscriptions ??= []);
  const clean = { ...input, name: input.name.trim() };
  if (id) {
    const sub = mustFind(list, id, 'Plano');
    Object.assign(sub, clean);
    return sub;
  }
  const sub: Subscription = { id: createId('sub'), ...clean, createdAt: ctx.now.toISOString() };
  list.push(sub);
  logActivity(draft, ctx, `ativou o plano ${sub.name} para ${client.company}`, `#/clientes/${client.id}`);
  return sub;
}

/** Remove o plano. Pagamentos já registrados continuam no histórico. */
export function deleteSubscription(draft: AppData, clientId: ID, id: ID): void {
  const client = mustFind(draft.clients, clientId, 'Cliente');
  client.subscriptions = (client.subscriptions ?? []).filter((s) => s.id !== id);
  for (const e of draft.finance.entries) if (e.subscriptionId === id) e.subscriptionId = null;
}

/** Vencimentos de um plano dentro do período [from, to]. */
export function subscriptionDates(sub: Subscription, from: ISODate, to: ISODate): ISODate[] {
  const dates: ISODate[] = [];
  let month = sub.startMonth < from.slice(0, 7) ? from.slice(0, 7) : sub.startMonth;
  for (let guard = 0; guard < 400 && month <= to.slice(0, 7); guard++, month = shiftMonth(month, 1)) {
    if (sub.endMonth && month > sub.endMonth) break;
    const [y, m] = month.split('-').map(Number);
    const date = `${month}-${String(Math.min(sub.billingDay, daysInMonth(y, m))).padStart(2, '0')}`;
    if (date >= from && date <= to) dates.push(date);
  }
  return dates;
}

/** Registra o pagamento de um mês do plano (ex.: The House, novembro). */
export function paySubscription(draft: AppData, clientId: ID, subscriptionId: ID, dueDate: ISODate, paidOn: ISODate, ctx: ActionContext): FinanceEntry {
  const client = mustFind(draft.clients, clientId, 'Cliente');
  const sub = mustFind(client.subscriptions ?? [], subscriptionId, 'Plano');
  const existing = draft.finance.entries.find((e) => e.subscriptionId === subscriptionId && e.dueDate === dueDate);
  if (existing) {
    existing.paidAt = paidOn;
    return existing;
  }
  const entry: FinanceEntry = {
    id: createId('fin'),
    kind: 'entrada',
    description: `${client.company} · ${sub.name}`,
    amount: sub.amount,
    dueDate,
    paidAt: paidOn,
    category: 'Plano mensal',
    paidBy: 'agencia',
    clientId: client.id,
    recurringId: null,
    subscriptionId,
    notes: '',
    createdAt: ctx.now.toISOString(),
  };
  draft.finance.entries.push(entry);
  logActivity(draft, ctx, `registrou o pagamento do plano de ${client.company}`, `#/clientes/${client.id}`);
  return entry;
}

export function activeSubscriptions(data: AppData, month: MonthKey): Array<{ client: Client; sub: Subscription }> {
  const list: Array<{ client: Client; sub: Subscription }> = [];
  for (const client of data.clients) {
    for (const sub of client.subscriptions ?? []) {
      if (sub.active && sub.startMonth <= month && (!sub.endMonth || sub.endMonth >= month)) list.push({ client, sub });
    }
  }
  return list;
}

/** Datas de vencimento de uma recorrência dentro do período [from, to]. */
export function recurringDates(rec: RecurringExpense, from: ISODate, to: ISODate): ISODate[] {
  const dates: ISODate[] = [];
  const day = Number(rec.startDate.slice(8, 10));
  const step = rec.frequency === 'anual' ? 12 : 1;
  let n = 0;
  // Pula direto para perto de `from` para não percorrer anos à toa.
  if (rec.startDate < from) {
    const months = (Number(from.slice(0, 4)) - Number(rec.startDate.slice(0, 4))) * 12 + (Number(from.slice(5, 7)) - Number(rec.startDate.slice(5, 7)));
    n = Math.max(0, Math.floor(months / step) - 1);
  }
  for (let guard = 0; guard < 400; guard++, n++) {
    const date = addMonths(rec.startDate, n * step, day);
    if (date > to) break;
    if (date >= from) dates.push(date);
  }
  return dates;
}

// ---------------------------------------------------------------- Movimentos (visão unificada)

export type MovementSource = 'entry' | 'installment' | 'recurring' | 'subscription';

export interface Movement {
  /** Identificador estável para a tela. */
  key: string;
  source: MovementSource;
  kind: 'entrada' | 'saida';
  description: string;
  amount: number;
  dueDate: ISODate;
  paidAt: ISODate | null;
  category: string;
  paidBy: Payer;
  clientId: ID | null;
  entryId?: ID;
  installmentId?: ID;
  recurringId?: ID;
  subscriptionId?: ID;
}

/** Data que define o mês do movimento: quando foi pago ou, se não foi, o vencimento. */
export function movementDate(m: Pick<Movement, 'paidAt' | 'dueDate'>): ISODate {
  return m.paidAt ?? m.dueDate;
}

/** Todos os movimentos (registrados, parcelas de clientes e recorrências) com vencimento ou pagamento no período. */
export function financeMovements(data: AppData, from: ISODate, to: ISODate): Movement[] {
  const inRange = (m: Movement) => {
    const date = movementDate(m);
    return date >= from && date <= to;
  };
  const list: Movement[] = [];
  for (const e of data.finance.entries) {
    const m: Movement = {
      key: `e:${e.id}`,
      source: 'entry',
      kind: e.kind,
      description: e.description,
      amount: e.amount,
      dueDate: e.dueDate,
      paidAt: e.paidAt,
      category: e.category,
      paidBy: e.paidBy,
      clientId: e.clientId,
      entryId: e.id,
      recurringId: e.recurringId ?? undefined,
      subscriptionId: e.subscriptionId ?? undefined,
    };
    if (inRange(m)) list.push(m);
  }
  for (const c of data.clients) {
    for (const i of c.installments) {
      const m: Movement = {
        key: `i:${i.id}`,
        source: 'installment',
        kind: 'entrada',
        description: `${c.company} · ${i.description}`,
        amount: i.amount,
        dueDate: i.dueDate,
        paidAt: i.paidAt,
        category: CLIENT_INCOME_CATEGORY,
        paidBy: 'agencia',
        clientId: c.id,
        installmentId: i.id,
      };
      if (inRange(m)) list.push(m);
    }
  }
  for (const rec of data.finance.recurring) {
    if (!rec.active) continue;
    for (const date of recurringDates(rec, from, to)) {
      if (data.finance.entries.some((e) => e.recurringId === rec.id && e.dueDate === date)) continue;
      list.push({
        key: `r:${rec.id}:${date}`,
        source: 'recurring',
        kind: 'saida',
        description: rec.description,
        amount: rec.amount,
        dueDate: date,
        paidAt: null,
        category: rec.category,
        paidBy: rec.paidBy,
        clientId: null,
        recurringId: rec.id,
      });
    }
  }
  for (const c of data.clients) {
    for (const sub of c.subscriptions ?? []) {
      if (!sub.active) continue;
      for (const date of subscriptionDates(sub, from, to)) {
        if (data.finance.entries.some((e) => e.subscriptionId === sub.id && e.dueDate === date)) continue;
        list.push({
          key: `s:${c.id}:${sub.id}:${date}`,
          source: 'subscription',
          kind: 'entrada',
          description: `${c.company} · ${sub.name}`,
          amount: sub.amount,
          dueDate: date,
          paidAt: null,
          category: 'Plano mensal',
          paidBy: 'agencia',
          clientId: c.id,
          subscriptionId: sub.id,
        });
      }
    }
  }
  return list.sort((a, b) => movementDate(a).localeCompare(movementDate(b)) || a.description.localeCompare(b.description));
}

export function monthMovements(data: AppData, month: MonthKey, category?: string): Movement[] {
  const list = financeMovements(data, `${month}-01`, `${month}-31`);
  return category ? list.filter((m) => m.category === category) : list;
}

export interface MonthSummary {
  /** Recebido no mês. */
  received: number;
  /** Despesas pagas no mês (sem contar as retiradas dos sócios). */
  paid: number;
  /** Lucro do mês: recebido − despesas pagas. */
  profit: number;
  /** Retiradas de lucro já feitas pelos sócios no mês. */
  withdrawn: number;
  /** Retiradas combinadas e ainda não feitas. */
  toWithdraw: number;
  /** Retirado por sócio no mês. */
  withdrawnByPartner: Record<ID, number>;
  /** Ficou no caixa: lucro − retiradas. */
  balance: number;
  /** Ainda a receber com vencimento no mês. */
  toReceive: number;
  /** Ainda a pagar com vencimento no mês. */
  toPay: number;
  /** Despesas do mês pagas do bolso de cada sócio. */
  paidByPartner: Record<ID, number>;
}

export function summarizeMovements(list: Movement[]): MonthSummary {
  const s: MonthSummary = { received: 0, paid: 0, profit: 0, withdrawn: 0, toWithdraw: 0, withdrawnByPartner: {}, balance: 0, toReceive: 0, toPay: 0, paidByPartner: {} };
  for (const m of list) {
    if (isWithdrawal(m)) {
      if (m.paidAt) {
        s.withdrawn += m.amount;
        s.withdrawnByPartner[m.paidBy] = (s.withdrawnByPartner[m.paidBy] ?? 0) + m.amount;
      } else {
        s.toWithdraw += m.amount;
      }
    } else if (m.kind === 'entrada') {
      if (m.paidAt) s.received += m.amount;
      else s.toReceive += m.amount;
    } else if (m.paidAt) {
      s.paid += m.amount;
      if (m.paidBy !== 'agencia') s.paidByPartner[m.paidBy] = (s.paidByPartner[m.paidBy] ?? 0) + m.amount;
    } else {
      s.toPay += m.amount;
    }
  }
  s.profit = s.received - s.paid;
  s.balance = s.profit - s.withdrawn;
  return s;
}

export function monthSummary(data: AppData, month: MonthKey, category?: string): MonthSummary {
  return summarizeMovements(monthMovements(data, month, category));
}

/** Faturamento do mês: tudo que entrou (parcelas de clientes + entradas avulsas recebidas). */
export function monthRevenue(data: AppData, month: MonthKey): number {
  return monthSummary(data, month).received;
}

/**
 * Contas a pagar e a receber que precisam de atenção: vencidas (até 60 dias
 * atrás) e as que vencem nos próximos `days` dias.
 */
export function upcomingBills(data: AppData, today: ISODate, days = 7): Movement[] {
  return financeMovements(data, addMonths(today, -2), addDays(today, days))
    .filter((m) => !m.paidAt && diffInDays(today, m.dueDate) <= days)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Categorias que aparecem nos movimentos (para o filtro). */
export function usedCategories(data: AppData): string[] {
  const set = new Set<string>([CLIENT_INCOME_CATEGORY]);
  for (const e of data.finance.entries) set.add(e.category);
  for (const r of data.finance.recurring) set.add(r.category);
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/** Mês atual (AAAA-MM). */
export function currentMonth(today: ISODate): MonthKey {
  return monthKey(today);
}

// ---------------------------------------------------------------- Gráfico do Painel

/** Períodos do gráfico de faturamento do Painel. */
export type RevenuePeriod = '7d' | '30d' | 'mes' | '12m';

export interface SeriesPoint {
  /** Data (AAAA-MM-DD) ou mês (AAAA-MM) do ponto. */
  key: string;
  /** Recebido no ponto (entradas pagas, sem retiradas). */
  revenue: number;
  /** Despesas pagas no ponto (sem retiradas dos sócios). */
  expenses: number;
}

export interface RevenueReport {
  period: RevenuePeriod;
  granularity: 'dia' | 'mes';
  from: ISODate;
  to: ISODate;
  points: SeriesPoint[];
  revenue: number;
  expenses: number;
  profit: number;
  /** Faturamento do período anterior de mesmo tamanho (para comparação). */
  previousRevenue: number;
  /** Quantidade de recebimentos no período (para o ticket médio). */
  payments: number;
  /** Ainda a receber com vencimento no período. */
  toReceive: number;
}

/** Intervalo [from, to] de um período terminando em `today`. */
export function periodRange(period: RevenuePeriod, today: ISODate): { from: ISODate; to: ISODate } {
  switch (period) {
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'mes':
      // Até hoje: os dias que ainda não chegaram não entram no gráfico.
      return { from: `${monthKey(today)}-01`, to: today };
    case '12m':
      return { from: `${monthKey(addMonths(today, -11, 1))}-01`, to: today };
  }
}

function lastDay(month: MonthKey): ISODate {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
}

/** Período imediatamente anterior, com o mesmo número de dias/meses. */
function previousRange(period: RevenuePeriod, from: ISODate, to: ISODate): { from: ISODate; to: ISODate } {
  if (period === 'mes') {
    // Mesmo trecho do mês passado (do dia 1 até o mesmo dia), para comparar de forma justa.
    const prev = monthKey(addMonths(from, -1, 1));
    const day = Math.min(Number(to.slice(8, 10)), Number(lastDay(prev).slice(8, 10)));
    return { from: `${prev}-01`, to: `${prev}-${String(day).padStart(2, '0')}` };
  }
  if (period === '12m') return { from: addMonths(from, -12, 1), to: addMonths(to, -12) };
  const days = diffInDays(from, to) + 1;
  return { from: addDays(from, -days), to: addDays(from, -1) };
}

/**
 * Faturamento e despesas pagos ao longo de um período, ponto a ponto
 * (por dia, ou por mês no período de 12 meses). Só conta o que foi
 * efetivamente pago/recebido, pela data do pagamento.
 */
export function revenueReport(data: AppData, period: RevenuePeriod, today: ISODate): RevenueReport {
  const { from, to } = periodRange(period, today);
  const granularity = period === '12m' ? 'mes' : 'dia';
  const points: SeriesPoint[] = [];
  const index = new Map<string, SeriesPoint>();
  if (granularity === 'dia') {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const p = { key: d, revenue: 0, expenses: 0 };
      points.push(p);
      index.set(d, p);
    }
  } else {
    for (let m = monthKey(from); m <= monthKey(to); m = monthKey(addMonths(`${m}-01`, 1, 1))) {
      const p = { key: m, revenue: 0, expenses: 0 };
      points.push(p);
      index.set(m, p);
    }
  }

  let payments = 0;
  let toReceive = 0;
  for (const m of financeMovements(data, from, to)) {
    if (isWithdrawal(m)) continue;
    if (!m.paidAt) {
      if (m.kind === 'entrada') toReceive += m.amount;
      continue;
    }
    const point = index.get(granularity === 'dia' ? m.paidAt : m.paidAt.slice(0, 7));
    if (!point) continue;
    if (m.kind === 'entrada') {
      point.revenue += m.amount;
      payments++;
    } else {
      point.expenses += m.amount;
    }
  }

  const prev = previousRange(period, from, to);
  const previousRevenue = financeMovements(data, prev.from, prev.to)
    .filter((m) => m.kind === 'entrada' && m.paidAt && !isWithdrawal(m))
    .reduce((sum, m) => sum + m.amount, 0);

  const revenue = points.reduce((s, p) => s + p.revenue, 0);
  const expenses = points.reduce((s, p) => s + p.expenses, 0);
  return { period, granularity, from, to, points, revenue, expenses, profit: revenue - expenses, previousRevenue, payments, toReceive };
}

/** Variação percentual entre dois valores (null quando não há base de comparação). */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Receita recorrente mensal (planos mensais ativos): para cada plano, usa o
 * mês mais recente até `month` (aceita o mês anterior, caso o deste mês
 * ainda não tenha sido criado) e soma o valor do plano.
 */
export function monthlyRecurringRevenue(data: AppData, month: MonthKey): { total: number; plans: number } {
  const prevMonth = monthKey(addMonths(`${month}-01`, -1, 1));
  const latest = new Map<string, AppData['projects'][number]>();
  for (const p of data.projects) {
    if (p.type !== 'plano_mensal' || !p.period || p.period > month) continue;
    const key = p.seriesId ?? p.id;
    const current = latest.get(key);
    if (!current || (current.period ?? '') < p.period) latest.set(key, p);
  }
  let total = 0;
  let plans = 0;
  const subs = activeSubscriptions(data, month);
  const withSubscription = new Set(subs.map((s) => s.client.id));
  for (const { sub } of subs) {
    total += sub.amount;
    plans++;
  }
  for (const p of latest.values()) {
    // Cliente com plano cadastrado em Clientes já foi contado acima.
    if ((p.period ?? '') < prevMonth || p.status === 'pausado' || withSubscription.has(p.clientId)) continue;
    total += p.extra.amount ?? 0;
    plans++;
  }
  return { total, plans };
}

// ---------------------------------------------------------------- Caixa

/** Primeiro dia com algum movimento registrado (ou saldo inicial). */
function firstFinanceDate(data: AppData, today: ISODate): ISODate {
  let first = today;
  const consider = (d: ISODate | null | undefined) => {
    if (d && d < first) first = d;
  };
  consider(data.finance.openingBalance?.date);
  for (const e of data.finance.entries) consider(e.paidAt ?? e.dueDate);
  for (const c of data.clients) for (const i of c.installments) consider(i.paidAt ?? i.dueDate);
  return first;
}

export interface CashPosition {
  /** Quanto tem na conta da agência hoje (tudo que entrou − tudo que saiu, desde o início). */
  balance: number;
  opening: number;
  received: number;
  paid: number;
  withdrawn: number;
  /** Separado em reservas. */
  reserved: number;
  /** Livre para usar: caixa − reservas. */
  free: number;
  since: ISODate;
}

/**
 * Caixa atual: soma TODOS os meses. Só conta o que foi efetivamente pago ou
 * recebido. Despesas pagas do bolso de um sócio não saem da conta da agência.
 */
export function cashPosition(data: AppData, today: ISODate): CashPosition {
  const since = firstFinanceDate(data, today);
  const opening = data.finance.openingBalance?.amount ?? 0;
  const pos: CashPosition = { balance: 0, opening, received: 0, paid: 0, withdrawn: 0, reserved: 0, free: 0, since };
  for (const m of financeMovements(data, since, today)) {
    if (!m.paidAt || m.paidAt > today) continue;
    if (isWithdrawal(m)) pos.withdrawn += m.amount;
    else if (m.kind === 'entrada') pos.received += m.amount;
    else if (m.paidBy === 'agencia') pos.paid += m.amount;
  }
  pos.balance = opening + pos.received - pos.paid - pos.withdrawn;
  pos.reserved = reserveBalances(data).reduce((sum, r) => sum + r.balance, 0);
  pos.free = pos.balance - pos.reserved;
  return pos;
}

export interface MonthRow {
  month: MonthKey;
  received: number;
  paid: number;
  withdrawn: number;
  /** Entrou − despesas − retiradas. */
  result: number;
  /** Caixa no fim do mês (acumulado desde o início). */
  cumulative: number;
}

/** Tabela mês a mês, do primeiro mês com movimento até o mês atual. */
export function monthByMonth(data: AppData, today: ISODate): MonthRow[] {
  const first = monthKey(firstFinanceDate(data, today));
  const last = monthKey(today);
  const rows: MonthRow[] = [];
  let cumulative = data.finance.openingBalance?.amount ?? 0;
  for (let month = first, guard = 0; month <= last && guard < 240; month = shiftMonth(month, 1), guard++) {
    const s = monthSummary(data, month);
    // No caixa, despesa paga do bolso de um sócio não sai da conta da agência.
    const fromPocket = Object.values(s.paidByPartner).reduce((a, b) => a + b, 0);
    const paidFromAccount = s.paid - fromPocket;
    const result = s.received - paidFromAccount - s.withdrawn;
    cumulative += result;
    rows.push({ month, received: s.received, paid: s.paid, withdrawn: s.withdrawn, result, cumulative });
  }
  return rows;
}

export function setOpeningBalance(draft: AppData, amount: number | null, date: ISODate): void {
  if (amount === null) {
    draft.finance.openingBalance = null;
    return;
  }
  if (!Number.isFinite(amount)) throw new Error('Informe um valor válido.');
  if (!isValidISODate(date)) throw new Error('Informe a data do saldo inicial.');
  draft.finance.openingBalance = { amount, date };
}

// ---------------------------------------------------------------- Reservas (caixinhas)

export function saveReserve(draft: AppData, id: ID | null, input: { name: string; goal: number | null }, ctx: ActionContext): Reserve {
  const name = input.name.trim();
  if (!name) throw new Error('Dê um nome para a reserva.');
  if (input.goal !== null && !(input.goal > 0)) throw new Error('A meta deve ser maior que zero.');
  const list = (draft.finance.reserves ??= []);
  if (list.some((r) => r.id !== id && r.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) throw new Error(`Já existe a reserva "${name}".`);
  if (id) {
    const r = mustFind(list, id, 'Reserva');
    r.name = name;
    r.goal = input.goal;
    return r;
  }
  const r: Reserve = { id: createId('res'), name, goal: input.goal, createdAt: ctx.now.toISOString() };
  list.push(r);
  return r;
}

export function deleteReserve(draft: AppData, id: ID): void {
  draft.finance.reserves = (draft.finance.reserves ?? []).filter((r) => r.id !== id);
  draft.finance.reserveMoves = (draft.finance.reserveMoves ?? []).filter((m) => m.reserveId !== id);
}

/** Guarda (+) ou tira (−) dinheiro de uma reserva. */
export function moveReserve(draft: AppData, reserveId: ID, amount: number, date: ISODate, note: string, ctx: ActionContext): ReserveMove {
  mustFind(draft.finance.reserves ?? [], reserveId, 'Reserva');
  if (!Number.isFinite(amount) || amount === 0) throw new Error('Informe um valor.');
  if (!isValidISODate(date)) throw new Error('Informe a data.');
  const current = reserveBalances(draft).find((r) => r.reserve.id === reserveId)?.balance ?? 0;
  if (amount < 0 && current + amount < -0.001) throw new Error('A reserva não tem esse valor para tirar.');
  const move: ReserveMove = { id: createId('rmv'), reserveId, amount, date, note: note.trim(), createdAt: ctx.now.toISOString() };
  (draft.finance.reserveMoves ??= []).push(move);
  return move;
}

export function reserveBalances(data: AppData): Array<{ reserve: Reserve; balance: number }> {
  return (data.finance.reserves ?? []).map((reserve) => ({
    reserve,
    balance: (data.finance.reserveMoves ?? []).filter((m) => m.reserveId === reserve.id).reduce((s, m) => s + m.amount, 0),
  }));
}
