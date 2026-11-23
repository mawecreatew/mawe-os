/**
 * Rotina da equipe: as 3 prioridades de cada pessoa no dia e o alinhamento
 * da noite (o que aconteceu, o que travou e o que fazer amanhã).
 */
import { addDays, type ISODate } from '../core/dates.ts';
import type { ActionContext } from './operations.ts';
import type { AgencyProfile, AppData, DailyNote, DailyPriority, ID } from './types.ts';

export const PRIORITIES_PER_DAY = 3;
/** Com o botão "+ Mais uma prioridade" dá para chegar a este limite. */
export const MAX_PRIORITIES = 8;
/** Quantos dias de rotina ficam guardados. */
const KEEP_DAYS = 60;

export function emptyDay(): DailyNote {
  return { priorities: {}, alignment: { happened: '', blocked: '', tomorrow: '', doneAt: null } };
}

export function dayOf(data: AppData, date: ISODate): DailyNote {
  return data.daily?.[date] ?? emptyDay();
}

/** Pelo menos 3 posições (vazias quando a pessoa ainda não escreveu); mais se ela acrescentou. */
export function prioritiesOf(data: AppData, date: ISODate, userId: ID): DailyPriority[] {
  const list = dayOf(data, date).priorities[userId] ?? [];
  const length = Math.min(MAX_PRIORITIES, Math.max(PRIORITIES_PER_DAY, list.length));
  return Array.from({ length }, (_, i) => list[i] ?? { text: '', done: false });
}

function editDay(draft: AppData, date: ISODate): DailyNote {
  draft.daily ??= {};
  const day = (draft.daily[date] ??= emptyDay());
  // Guarda só os últimos dias, para os dados não crescerem para sempre.
  const oldest = addDays(date, -KEEP_DAYS);
  for (const key of Object.keys(draft.daily)) if (key < oldest) delete draft.daily[key];
  return day;
}

function editPriorities(draft: AppData, date: ISODate, userId: ID): DailyPriority[] {
  const day = editDay(draft, date);
  const list = prioritiesOf(draft, date, userId).map((p) => ({ ...p }));
  day.priorities[userId] = list;
  return list;
}

/** Abre mais uma linha de prioridade (até o limite). */
export function addPrioritySlot(draft: AppData, date: ISODate, ctx: ActionContext): void {
  const list = editPriorities(draft, date, ctx.userId);
  if (list.length >= MAX_PRIORITIES) throw new Error(`Dá para ter até ${MAX_PRIORITIES} prioridades por dia.`);
  list.push({ text: '', done: false });
}

/** Tira uma prioridade extra (as 3 primeiras ficam sempre). */
export function removePrioritySlot(draft: AppData, date: ISODate, index: number, ctx: ActionContext): void {
  const list = editPriorities(draft, date, ctx.userId);
  if (index < PRIORITIES_PER_DAY || index >= list.length) throw new Error('Só as prioridades extras podem ser tiradas.');
  list.splice(index, 1);
}

export function setPriority(draft: AppData, date: ISODate, index: number, text: string, ctx: ActionContext): void {
  const list = editPriorities(draft, date, ctx.userId);
  if (index < 0 || index >= list.length) throw new Error('Prioridade inválida.');
  list[index].text = text.trim();
  if (!list[index].text) list[index].done = false;
}

export function togglePriority(draft: AppData, date: ISODate, index: number, ctx: ActionContext): void {
  const list = editPriorities(draft, date, ctx.userId);
  if (index < 0 || index >= list.length) throw new Error('Prioridade inválida.');
  if (!list[index].text) throw new Error('Escreva a prioridade antes de marcar como feita.');
  list[index].done = !list[index].done;
}

export type AlignmentField = 'happened' | 'blocked' | 'tomorrow';

export function setAlignment(draft: AppData, date: ISODate, field: AlignmentField, text: string): void {
  if (!['happened', 'blocked', 'tomorrow'].includes(field)) throw new Error('Campo inválido.');
  editDay(draft, date).alignment[field] = text.trim();
}

export function toggleAlignmentDone(draft: AppData, date: ISODate, ctx: ActionContext): void {
  const day = editDay(draft, date);
  day.alignment.doneAt = day.alignment.doneAt ? null : ctx.now.toISOString();
}

/** O "o que fazer amanhã" do alinhamento de ontem vira lembrete no dia seguinte. */
export function yesterdayPlan(data: AppData, today: ISODate): string {
  return dayOf(data, addDays(today, -1)).alignment.tomorrow;
}

// ---------------------------------------------------------------- Dados da agência

export const DEFAULT_AGENCY: AgencyProfile = {
  name: 'Mawe Create',
  responsible: '',
  document: '',
  city: 'Brusque, SC',
  pix: '',
  whatsapp: '',
  email: '',
  instagram: '@mawecreate',
  website: 'mawecreate.com.br',
  paymentTerms: 'À vista via Pix, antes do início do projeto.',
  hostingNote: 'O site é publicado em uma plataforma de hospedagem escolhida pela CONTRATADA. Se houver custo de hospedagem, ele é informado antes da publicação.',
};

export function agencyOf(data: AppData): AgencyProfile {
  return { ...DEFAULT_AGENCY, ...(data.agency ?? {}) };
}

export function saveAgency(draft: AppData, input: Partial<AgencyProfile>): void {
  const next = { ...agencyOf(draft) };
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') (next as Record<string, string>)[key] = value.trim();
  }
  if (!next.name) throw new Error('Informe o nome da agência.');
  draft.agency = next;
}
