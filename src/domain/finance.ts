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
import { CLIENT_INCOME_CATEGORY } from './labels.ts';
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

function checkEntry(draft: AppData, input: FinanceEntryInput): void {
  if (!input.description.trim()) throw new Error('Descreva o lançamento.');
  if (!(input.amount > 0)) throw new Error('O valor deve ser maior que zero.');
  if (!isValidISODate(input.dueDate)) throw new Error('Informe uma data válida.');
  if (input.paidAt !== null && !isValidISODate(input.paidAt)) throw new Error('Data de pagamento inválida.');
  if (input.clientId && !draft.clients.some((c) => c.id === input.clientId)) throw new Error('Cliente não encontrado.');
  validPayer(draft, input.paidBy);
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
  /** Pago no mês. */
  paid: number;
  /** Recebido − pago. */
  balance: number;
  /** Ainda a receber com vencimento no mês. */
  toReceive: number;
  /** Ainda a pagar com vencimento no mês. */
  toPay: number;
  /** Despesas do mês pagas do bolso de cada sócio. */
  paidByPartner: Record<ID, number>;
}

export function summarizeMovements(list: Movement[]): MonthSummary {
  const s: MonthSummary = { received: 0, paid: 0, balance: 0, toReceive: 0, toPay: 0, paidByPartner: {} };
  for (const m of list) {
    if (m.kind === 'entrada') {
      if (m.paidAt) s.received += m.amount;
      else s.toReceive += m.amount;
    } else if (m.paidAt) {
      s.paid += m.amount;
      if (m.paidBy !== 'agencia') s.paidByPartner[m.paidBy] = (s.paidByPartner[m.paidBy] ?? 0) + m.amount;
    } else {
      s.toPay += m.amount;
    }
  }
  s.balance = s.received - s.paid;
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
