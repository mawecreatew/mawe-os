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
import { addDays, addMonths, diffInDays, isValidISODate, monthKey, type ISODate, type MonthKey } from '../core/dates.ts';
import { createId } from '../core/id.ts';
import { CLIENT_INCOME_CATEGORY, WITHDRAWAL_CATEGORY } from './labels.ts';
import type { ActionContext } from './operations.ts';
import type { AppData, FinanceEntry, ID, Payer, RecurringExpense } from './types.ts';

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
  const entry: FinanceEntry = { id: createId('fin'), ...clean, recurringId: null, createdAt: ctx.now.toISOString() };
  draft.finance.entries.push(entry);
  return entry;
}

export function deleteFinanceEntry(draft: AppData, id: ID): void {
  mustFind(draft.finance.entries, id, 'Lançamento');
  draft.finance.entries = draft.finance.entries.filter((e) => e.id !== id);
}

/** Marca/desmarca como pago (saída) ou recebido (entrada). */
export function toggleFinanceEntryPaid(draft: AppData, id: ID, paidOn: ISODate): void {
  const entry = mustFind(draft.finance.entries, id, 'Lançamento');
  if (entry.recurringId && entry.paidAt) {
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
    notes: '',
    createdAt: ctx.now.toISOString(),
  };
  draft.finance.entries.push(entry);
  return entry;
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

export type MovementSource = 'entry' | 'installment' | 'recurring';

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
  for (const p of latest.values()) {
    if ((p.period ?? '') < prevMonth || p.status === 'pausado') continue;
    total += p.extra.amount ?? 0;
    plans++;
  }
  return { total, plans };
}
