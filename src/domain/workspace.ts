/**
 * Central da equipe: bloco de notas, chat, planejamento da agência (metas da
 * semana e quadro de ideias), treinamento de quem entrar, horas por projeto
 * e divisão do dinheiro.
 */
import { addDays, diffInDays, startOfWeek, type ISODate } from '../core/dates.ts';
import { createId } from '../core/id.ts';
import { logActivity } from './activity.ts';
import { proposalTotals } from './business.ts';
import type { ActionContext } from './operations.ts';
import { teamMembers } from './people.ts';
import type {
  AgencyIdea,
  AppData,
  ChatMessage,
  ID,
  IdeaStatus,
  MoneySplit,
  Note,
  NoteColor,
  Project,
  RelatedRef,
  TimeLog,
  WeekGoal,
} from './types.ts';

// ---------------------------------------------------------------- Bloco de notas

export const NOTE_COLORS: Array<{ value: NoteColor; label: string }> = [
  { value: 'creme', label: 'Creme' },
  { value: 'rosa', label: 'Rosa' },
  { value: 'verde', label: 'Verde' },
  { value: 'azul', label: 'Azul' },
  { value: 'amarelo', label: 'Amarelo' },
];

export interface NoteInput {
  title: string;
  text: string;
  color: NoteColor;
  private: boolean;
}

/** Notas que esta pessoa pode ver: as dos dois e as particulares dela. Fixadas primeiro. */
export function visibleNotes(data: AppData, userId: ID): Note[] {
  return (data.notes ?? [])
    .filter((n) => !n.private || n.authorId === userId)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
}

function ownNote(draft: AppData, id: ID, userId: ID): Note {
  const note = (draft.notes ?? []).find((n) => n.id === id);
  if (!note || (note.private && note.authorId !== userId)) throw new Error('Nota não encontrada.');
  return note;
}

export function saveNote(draft: AppData, id: ID | null, input: NoteInput, ctx: ActionContext): Note {
  const title = input.title.trim();
  const text = input.text.trim();
  if (!title && !text) throw new Error('Escreva alguma coisa na nota.');
  if (!NOTE_COLORS.some((c) => c.value === input.color)) throw new Error('Cor inválida.');
  const at = ctx.now.toISOString();
  draft.notes ??= [];
  if (id) {
    const note = ownNote(draft, id, ctx.userId);
    Object.assign(note, { title, text, color: input.color, private: note.authorId === ctx.userId ? input.private : note.private, updatedAt: at });
    return note;
  }
  const note: Note = { id: createId('nota'), title, text, color: input.color, pinned: false, private: input.private, authorId: ctx.userId, createdAt: at, updatedAt: at };
  draft.notes.push(note);
  return note;
}

export function toggleNotePin(draft: AppData, id: ID, ctx: ActionContext): void {
  const note = ownNote(draft, id, ctx.userId);
  note.pinned = !note.pinned;
}

export function deleteNote(draft: AppData, id: ID, ctx: ActionContext): void {
  ownNote(draft, id, ctx.userId);
  draft.notes = (draft.notes ?? []).filter((n) => n.id !== id);
}

// ---------------------------------------------------------------- Chat da equipe

/** Quantas mensagens ficam guardadas (as mais antigas saem). */
export const CHAT_LIMIT = 500;

export function sendChatMessage(draft: AppData, text: string, related: RelatedRef | null, ctx: ActionContext): ChatMessage {
  const clean = text.trim();
  if (!clean) throw new Error('Escreva a mensagem.');
  if (clean.length > 2000) throw new Error('Mensagem muito longa (máximo 2.000 caracteres).');
  const message: ChatMessage = { id: createId('msg'), authorId: ctx.userId, text: clean, at: ctx.now.toISOString(), related };
  draft.chat = [...(draft.chat ?? []), message].slice(-CHAT_LIMIT);
  draft.chatRead = { ...(draft.chatRead ?? {}), [ctx.userId]: message.at };
  return message;
}

export function deleteChatMessage(draft: AppData, id: ID, ctx: ActionContext): void {
  const message = (draft.chat ?? []).find((m) => m.id === id);
  if (!message) return;
  if (message.authorId !== ctx.userId) throw new Error('Só quem escreveu pode apagar a mensagem.');
  draft.chat = (draft.chat ?? []).filter((m) => m.id !== id);
}

export function markChatRead(draft: AppData, ctx: ActionContext): void {
  const last = (draft.chat ?? []).at(-1);
  if (!last) return;
  draft.chatRead = { ...(draft.chatRead ?? {}), [ctx.userId]: last.at };
}

/** Mensagens dos outros que esta pessoa ainda não viu. */
export function unreadChat(data: AppData, userId: ID): number {
  const read = data.chatRead?.[userId] ?? '';
  return (data.chat ?? []).filter((m) => m.authorId !== userId && m.at > read).length;
}

// ---------------------------------------------------------------- Planejamento

export const IDEA_STATUSES: Array<{ value: IdeaStatus; label: string }> = [
  { value: 'ideia', label: 'Ideia' },
  { value: 'fazendo', label: 'Fazendo' },
  { value: 'feito', label: 'Feito' },
];

export function saveIdea(draft: AppData, id: ID | null, input: { title: string; notes: string; ownerIds: ID[]; status?: IdeaStatus }, ctx: ActionContext): AgencyIdea {
  const title = input.title.trim();
  if (!title) throw new Error('Dê um nome para a ideia.');
  draft.ideas ??= [];
  if (id) {
    const idea = draft.ideas.find((i) => i.id === id);
    if (!idea) throw new Error('Ideia não encontrada.');
    Object.assign(idea, { title, notes: input.notes.trim(), ownerIds: input.ownerIds, status: input.status ?? idea.status });
    return idea;
  }
  const idea: AgencyIdea = { id: createId('ideia'), title, notes: input.notes.trim(), status: input.status ?? 'ideia', ownerIds: input.ownerIds, authorId: ctx.userId, createdAt: ctx.now.toISOString() };
  draft.ideas.push(idea);
  return idea;
}

export function moveIdea(draft: AppData, id: ID, status: IdeaStatus, ctx: ActionContext): void {
  const idea = (draft.ideas ?? []).find((i) => i.id === id);
  if (!idea) throw new Error('Ideia não encontrada.');
  if (!IDEA_STATUSES.some((s) => s.value === status)) throw new Error('Situação inválida.');
  idea.status = status;
  if (status === 'feito') logActivity(draft, ctx, `concluiu a ideia "${idea.title}"`, '#/planejamento');
}

export function deleteIdea(draft: AppData, id: ID): void {
  draft.ideas = (draft.ideas ?? []).filter((i) => i.id !== id);
}

export function weekGoals(data: AppData, weekStart: ISODate): WeekGoal[] {
  return (data.weekGoals ?? []).filter((g) => g.weekStart === weekStart);
}

export function addWeekGoal(draft: AppData, today: ISODate, text: string, ownerId: ID | null): WeekGoal {
  const clean = text.trim();
  if (!clean) throw new Error('Escreva a meta da semana.');
  const goal: WeekGoal = { id: createId('meta'), weekStart: startOfWeek(today), text: clean, done: false, ownerId };
  // Guarda só as últimas 26 semanas.
  const oldest = addDays(goal.weekStart, -7 * 26);
  draft.weekGoals = [...(draft.weekGoals ?? []).filter((g) => g.weekStart >= oldest), goal];
  return goal;
}

export function toggleWeekGoal(draft: AppData, id: ID): void {
  const goal = (draft.weekGoals ?? []).find((g) => g.id === id);
  if (goal) goal.done = !goal.done;
}

export function deleteWeekGoal(draft: AppData, id: ID): void {
  draft.weekGoals = (draft.weekGoals ?? []).filter((g) => g.id !== id);
}

// ---------------------------------------------------------------- Treinamento

export interface TrainingStatus {
  read: number;
  solo: number;
  total: number;
}

export function trainingOf(data: AppData, userId: ID, processId: ID): { readAt: string | null; soloAt: string | null } {
  return data.training?.[userId]?.[processId] ?? { readAt: null, soloAt: null };
}

export function trainingStatus(data: AppData, userId: ID): TrainingStatus {
  const processes = data.processes ?? [];
  let read = 0;
  let solo = 0;
  for (const p of processes) {
    const t = trainingOf(data, userId, p.id);
    if (t.readAt) read++;
    if (t.soloAt) solo++;
  }
  return { read, solo, total: processes.length };
}

/** Marca (ou desmarca) "li" ou "já fiz sozinho" num processo. Só a própria pessoa marca o dela. */
export function toggleTraining(draft: AppData, processId: ID, field: 'readAt' | 'soloAt', ctx: ActionContext): void {
  if (!(draft.processes ?? []).some((p) => p.id === processId)) throw new Error('Processo não encontrado.');
  draft.training ??= {};
  const mine = (draft.training[ctx.userId] ??= {});
  const entry = (mine[processId] ??= { readAt: null, soloAt: null });
  entry[field] = entry[field] ? null : ctx.now.toISOString();
  // Quem já fez sozinho também leu.
  if (field === 'soloAt' && entry.soloAt && !entry.readAt) entry.readAt = entry.soloAt;
}

// ---------------------------------------------------------------- Horas por projeto

export function logTime(draft: AppData, projectId: ID, input: { date: ISODate; minutes: number; note: string }, ctx: ActionContext): TimeLog {
  const project = draft.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('Projeto não encontrado.');
  if (!Number.isFinite(input.minutes) || input.minutes <= 0) throw new Error('Informe quanto tempo trabalhou.');
  if (input.minutes > 16 * 60) throw new Error('Mais de 16 horas num registro? Divida em dias.');
  const log: TimeLog = { id: createId('hora'), userId: ctx.userId, date: input.date, minutes: Math.round(input.minutes), note: input.note.trim() };
  project.timeLogs = [...(project.timeLogs ?? []), log];
  return log;
}

export function deleteTimeLog(draft: AppData, projectId: ID, logId: ID): void {
  const project = draft.projects.find((p) => p.id === projectId);
  if (project) project.timeLogs = (project.timeLogs ?? []).filter((l) => l.id !== logId);
}

export function startTimer(draft: AppData, projectId: ID, ctx: ActionContext): void {
  if (!draft.projects.some((p) => p.id === projectId)) throw new Error('Projeto não encontrado.');
  if (draft.timers?.[ctx.userId]) throw new Error('Você já tem um cronômetro ligado. Pare o outro primeiro.');
  draft.timers = { ...(draft.timers ?? {}), [ctx.userId]: { projectId, startedAt: ctx.now.toISOString() } };
}

/** Para o cronômetro e registra o tempo (mínimo de 1 minuto). */
export function stopTimer(draft: AppData, ctx: ActionContext, note = ''): TimeLog | null {
  const timer = draft.timers?.[ctx.userId];
  if (!timer) return null;
  const minutes = Math.max(1, Math.round((ctx.now.getTime() - Date.parse(timer.startedAt)) / 60_000));
  const timers = { ...(draft.timers ?? {}) };
  delete timers[ctx.userId];
  draft.timers = timers;
  const project = draft.projects.find((p) => p.id === timer.projectId);
  if (!project) return null;
  return logTime(draft, project.id, { date: ctx.now.toISOString().slice(0, 10), minutes: Math.min(minutes, 16 * 60), note }, ctx);
}

export function projectMinutes(project: Project): number {
  return (project.timeLogs ?? []).reduce((s, l) => s + l.minutes, 0);
}

/**
 * Quanto o projeto rendeu: valor do plano/pacote, ou a proposta aceita ligada
 * a ele, ou (se o cliente só tem este projeto) as parcelas do cliente.
 */
export function projectValue(data: AppData, project: Project): number | null {
  if (project.extra.amount) return project.extra.amount;
  const proposal = data.proposals.find((p) => p.status === 'aceita' && p.projectIds.includes(project.id));
  if (proposal) return proposalTotals(proposal).oneTime || null;
  const client = data.clients.find((c) => c.id === project.clientId);
  const siblings = data.projects.filter((p) => p.clientId === project.clientId);
  if (client && siblings.length === 1) {
    const total = client.installments.reduce((s, i) => s + i.amount, 0);
    return total || null;
  }
  return null;
}

/** Valor por hora trabalhada (`null` quando falta o valor ou as horas). */
export function valuePerHour(data: AppData, project: Project): number | null {
  const minutes = projectMinutes(project);
  const value = projectValue(data, project);
  if (!minutes || !value) return null;
  return value / (minutes / 60);
}

/** Lê "1h30", "1:30", "90 min" ou "1,5" (horas) e devolve minutos. */
export function parseDuration(text: string): number {
  const t = text.trim().toLowerCase().replace(',', '.');
  const hm = /^(\d+)\s*h\s*(\d+)?\s*(min)?$/.exec(t);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2] ?? 0);
  const colon = /^(\d+):(\d{1,2})$/.exec(t);
  if (colon) return Number(colon[1]) * 60 + Number(colon[2]);
  const min = /^(\d+)\s*min$/.exec(t);
  if (min) return Number(min[1]);
  const hours = Number(t.replace(/h$/, ''));
  if (Number.isFinite(hours) && hours > 0) return Math.round(hours * 60);
  throw new Error('Escreva o tempo como 1h30, 1:30, 90 min ou 1,5.');
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

// ---------------------------------------------------------------- Divisão do dinheiro

export function defaultSplit(data: AppData): MoneySplit {
  const partners = teamMembers(data).filter((u) => u.role === 'socio');
  const each = partners.length ? Math.floor((70 / partners.length) * 10) / 10 : 0;
  return { agency: 30, taxes: 0, partners: Object.fromEntries(partners.map((u) => [u.id, each])) };
}

export function splitOf(data: AppData): MoneySplit {
  return data.moneySplit ?? defaultSplit(data);
}

export function saveSplit(draft: AppData, split: MoneySplit): void {
  const values = [split.agency, split.taxes, ...Object.values(split.partners)];
  if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 100)) throw new Error('Use porcentagens de 0 a 100.');
  const total = values.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > 0.05) throw new Error(`As porcentagens precisam somar 100% (agora somam ${total.toLocaleString('pt-BR')}%).`);
  draft.moneySplit = { agency: split.agency, taxes: split.taxes, partners: { ...split.partners } };
}

/** Quanto de um valor vai para cada parte. */
export function splitAmounts(split: MoneySplit, amount: number): { agency: number; taxes: number; partners: Record<ID, number> } {
  const part = (pct: number) => Math.round(amount * pct) / 100;
  return { agency: part(split.agency), taxes: part(split.taxes), partners: Object.fromEntries(Object.entries(split.partners).map(([id, pct]) => [id, part(pct)])) };
}

/** Dias desde a última mensagem do chat (para a tela vazia não parecer abandonada). */
export function daysSinceLastMessage(data: AppData, today: ISODate): number | null {
  const last = (data.chat ?? []).at(-1);
  return last ? diffInDays(last.at.slice(0, 10), today) : null;
}
