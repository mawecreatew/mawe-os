/**
 * Regras do Comercial: de quem é a vez em cada etapa, quando um lead pede
 * ação (e quando NÃO pede), registro de contatos, motivos de perda, números
 * do topo da tela, relatórios e mensagem pronta para o WhatsApp.
 *
 * Ideia central: "atrasado" só existe quando a próxima ação depende de vocês.
 * Quando vocês já fizeram a parte de vocês e estão esperando o cliente, o
 * sistema mostra há quanto tempo estão esperando e quantas tentativas fizeram,
 * e só sugere um follow-up se a etapa estiver configurada para isso.
 */
import { addDays, diffInDays, formatShortDate, isValidISODate, type ISODate } from '../core/dates.ts';
import { createId } from '../core/id.ts';
import { normalizeText } from '../core/format.ts';
import { logActivity } from './activity.ts';
import { FINAL_STAGES, LOST_STAGE, WON_STAGE, pipelineStages, stageLabel } from './labels.ts';
import type { ActionContext } from './operations.ts';
import type { AppData, ContactChannel, ContactLog, ID, Opportunity, PipelineStage, StageKind, Tone } from './types.ts';

// ---------------------------------------------------------------- Tipos de etapa

export const STAGE_KINDS: Array<{ value: StageKind; label: string; description: string }> = [
  { value: 'nossa_vez', label: 'Nossa vez', description: 'Depende de vocês. Pode ficar pendente.' },
  { value: 'vez_cliente', label: 'Vez do cliente', description: 'Vocês já fizeram a parte de vocês. Nunca fica atrasada.' },
  { value: 'pausado', label: 'Pausado', description: 'Lead para depois. Sem alerta, só lembrete se vocês quiserem.' },
];

/** Dias padrão para sugerir follow-up numa etapa "vez do cliente" sem configuração. */
export const DEFAULT_FOLLOW_UP_DAYS = 3;
/** Depois de tantas tentativas sem resposta o sistema para de sugerir follow-up. */
export const MAX_ATTEMPTS = 3;

/** Tipo sugerido pelo nome da etapa (usado só quando a etapa ainda não tem tipo). */
export function guessStageKind(label: string): StageKind {
  const t = normalizeText(label);
  if (/futuro|depois|pausad|ja esta|esfri|congelad|mais pra frente|mais para frente/.test(t)) return 'pausado';
  if (/aguardando|esperando|primeiro contato|contato realizado|contato feito|reuni|enviad|proposta enviada|negocia/.test(t)) return 'vez_cliente';
  return 'nossa_vez';
}

/** Dias de follow-up sugeridos pelo nome (aguardando decisão e reunião: não cobra). */
export function guessFollowUpDays(label: string): number {
  const t = normalizeText(label);
  if (/aguardando decis|reuni|negocia/.test(t)) return 0;
  return DEFAULT_FOLLOW_UP_DAYS;
}

/** Completa `kind` e `followUpDays` das etapas que ainda não têm (determinístico). */
export function fillStageKinds(stages: PipelineStage[]): void {
  for (const s of stages) {
    if (FINAL_STAGES.includes(s.id)) {
      delete s.kind;
      delete s.followUpDays;
      continue;
    }
    if (!s.kind) s.kind = guessStageKind(s.label);
    if (s.kind === 'vez_cliente' && typeof s.followUpDays !== 'number') s.followUpDays = guessFollowUpDays(s.label);
  }
}

export function stageInfo(data: Pick<AppData, 'pipelineStages'>, stageId: string): PipelineStage | undefined {
  return pipelineStages(data).find((s) => s.id === stageId);
}

export function stageKind(data: Pick<AppData, 'pipelineStages'>, stageId: string): StageKind | 'final' {
  if (FINAL_STAGES.includes(stageId)) return 'final';
  return stageInfo(data, stageId)?.kind ?? 'nossa_vez';
}

export function setStageBehavior(draft: AppData, id: string, patch: { kind?: StageKind; followUpDays?: number }): void {
  const stage = draft.pipelineStages.find((s) => s.id === id);
  if (!stage || FINAL_STAGES.includes(id)) throw new Error('Etapa não encontrada.');
  if (patch.kind) {
    stage.kind = patch.kind;
    if (patch.kind === 'vez_cliente' && typeof stage.followUpDays !== 'number') stage.followUpDays = guessFollowUpDays(stage.label);
  }
  if (patch.followUpDays !== undefined) {
    if (!Number.isInteger(patch.followUpDays) || patch.followUpDays < 0 || patch.followUpDays > 60) throw new Error('Use um número de 0 a 60 dias.');
    stage.followUpDays = patch.followUpDays;
  }
}

// ---------------------------------------------------------------- Contatos

export const CONTACT_CHANNELS: Array<{ value: ContactChannel; label: string }> = [
  { value: 'whatsapp', label: 'Mensagem no WhatsApp' },
  { value: 'audio', label: 'Áudio no WhatsApp' },
  { value: 'ligacao', label: 'Ligação' },
  { value: 'visita', label: 'Visita presencial' },
  { value: 'instagram', label: 'Direct do Instagram' },
  { value: 'email', label: 'E-mail' },
  { value: 'outro', label: 'Outro' },
];

export function channelLabel(channel: ContactChannel): string {
  return CONTACT_CHANNELS.find((c) => c.value === channel)?.label ?? 'Contato';
}

export function contactLog(opp: Opportunity): ContactLog[] {
  return opp.contactLog ?? [];
}

/** Contatos enviados por vocês. Dados antigos sem registro contam o "contato feito" como 1. */
export function sentContacts(opp: Opportunity): Array<{ date: ISODate }> {
  const log: Array<{ date: ISODate }> = contactLog(opp).filter((c) => c.direction === 'enviado');
  // "Começamos a conversar em" conta como um contato, se não houver registro nesse dia ou antes.
  if (opp.contactedAt && !log.some((c) => c.date <= opp.contactedAt!)) return [{ date: opp.contactedAt }, ...log];
  return log;
}

export function lastSentDate(opp: Opportunity): ISODate | null {
  return sentContacts(opp).reduce<ISODate | null>((max, c) => (!max || c.date > max ? c.date : max), null);
}

export function lastReplyDate(opp: Opportunity): ISODate | null {
  const log = contactLog(opp).filter((c) => c.direction === 'recebido');
  const fromLog = log.reduce<ISODate | null>((max, c) => (!max || c.date > max ? c.date : max), null);
  return fromLog ?? opp.repliedAt ?? null;
}

/** Tentativas desde a última resposta do cliente (o que conta para "parou de responder"). */
export function attemptsWithoutReply(opp: Opportunity): number {
  const reply = lastReplyDate(opp);
  return sentContacts(opp).filter((c) => !reply || c.date > reply).length;
}

export interface ContactInput {
  date: ISODate;
  channel: ContactChannel;
  direction: 'enviado' | 'recebido';
  note: string;
}

export interface ContactOptions {
  /** Move para esta etapa depois de registrar. */
  moveTo?: string | null;
  /** Nova data de lembrete/próxima ação (`null` limpa; `undefined` não mexe). */
  followUpDate?: ISODate | null;
}

export function logContact(draft: AppData, oppId: ID, input: ContactInput, ctx: ActionContext, options: ContactOptions = {}): ContactLog {
  const opp = draft.opportunities.find((o) => o.id === oppId);
  if (!opp) throw new Error('Oportunidade não encontrada.');
  if (!isValidISODate(input.date)) throw new Error('Informe a data do contato.');
  const entry: ContactLog = { id: createId('ctt'), date: input.date, channel: input.channel, direction: input.direction, note: input.note.trim(), authorId: ctx.userId, at: ctx.now.toISOString() };
  opp.contactLog = [...contactLog(opp), entry];
  if (input.direction === 'enviado' && !opp.contactedAt) opp.contactedAt = input.date;
  if (input.direction === 'recebido') {
    if (!opp.repliedAt) opp.repliedAt = input.date;
    if (!opp.contactedAt) opp.contactedAt = input.date;
  }
  const what = input.direction === 'enviado' ? channelLabel(input.channel) : `Cliente respondeu (${channelLabel(input.channel).toLowerCase()})`;
  opp.history.push({ id: createId('his'), at: ctx.now.toISOString(), authorId: ctx.userId, text: `${what}${entry.note ? `: ${entry.note}` : '.'}` });
  if (options.followUpDate !== undefined) opp.followUpDate = options.followUpDate;
  if (options.moveTo && options.moveTo !== opp.stage) {
    if (!draft.pipelineStages.some((s) => s.id === options.moveTo)) throw new Error('Etapa do funil não encontrada.');
    const from = opp.stage;
    opp.stage = options.moveTo;
    if (FINAL_STAGES.includes(opp.stage)) opp.closedAt = input.date;
    opp.history.push({ id: createId('his'), at: ctx.now.toISOString(), authorId: ctx.userId, text: `Etapa alterada: ${stageLabel(draft, from)} → ${stageLabel(draft, opp.stage)}.` });
  }
  logActivity(draft, ctx, input.direction === 'enviado' ? `registrou contato com ${opp.company}` : `registrou que ${opp.company} respondeu`, `#/comercial/${opp.id}`);
  return entry;
}

export function removeContact(draft: AppData, oppId: ID, contactId: ID): void {
  const opp = draft.opportunities.find((o) => o.id === oppId);
  if (!opp) throw new Error('Oportunidade não encontrada.');
  opp.contactLog = contactLog(opp).filter((c) => c.id !== contactId);
  // Ajusta as marcações para continuarem coerentes com o que sobrou.
  const sent = opp.contactLog.filter((c) => c.direction === 'enviado').map((c) => c.date).sort();
  const got = opp.contactLog.filter((c) => c.direction === 'recebido').map((c) => c.date).sort();
  if (opp.contactLog.length) {
    opp.contactedAt = [sent[0], got[0]].filter(Boolean).sort()[0] ?? null;
    opp.repliedAt = got[0] ?? null;
  }
}

export function setLostReason(draft: AppData, oppIds: readonly ID[], reason: string | null, note: string, ctx: ActionContext): void {
  for (const id of oppIds) {
    const opp = draft.opportunities.find((o) => o.id === id);
    if (!opp) continue;
    opp.lostReason = reason;
    if (reason || note.trim()) {
      opp.history.push({ id: createId('his'), at: ctx.now.toISOString(), authorId: ctx.userId, text: `Não fechou${reason ? `: ${reason}` : ''}${note.trim() ? ` (${note.trim()})` : ''}.` });
    }
  }
}

/** Limpa o lembrete (ex.: "já falei, tira daqui"). */
export function clearFollowUp(draft: AppData, oppId: ID): void {
  const opp = draft.opportunities.find((o) => o.id === oppId);
  if (opp) opp.followUpDate = null;
}

// ---------------------------------------------------------------- Situação de cada lead

export type FollowState =
  | 'final' // ganho ou perdido
  | 'pendente' // nossa vez, data já passou
  | 'hoje' // nossa vez, data é hoje
  | 'agendado' // tem data no futuro
  | 'lembrete' // vez do cliente/pausado com lembrete que chegou
  | 'follow_up' // vez do cliente, passou do prazo sem resposta: hora do follow-up
  | 'sem_resposta' // vez do cliente, já tentou várias vezes
  | 'aguardando' // vez do cliente, esperando dentro do prazo
  | 'pausado' // lead para depois
  | 'livre'; // nossa vez sem data

export interface FollowStatus {
  state: FollowState;
  /** Texto curto para o card ("Hora do follow-up", "Aguardando há 9 dias"). */
  label: string;
  tone: Tone | 'none';
  /** Entra no "Para agir hoje" e no Foco de hoje. */
  needsAction: boolean;
  /** Dias esperando o cliente (só em "vez do cliente"). */
  waitingDays: number | null;
  attempts: number;
}

function dayDiff(from: ISODate, to: ISODate): number {
  return diffInDays(from, to);
}

export function followStatus(data: Pick<AppData, 'pipelineStages'>, opp: Opportunity, today: ISODate): FollowStatus {
  const kind = stageKind(data, opp.stage);
  const attempts = attemptsWithoutReply(opp);
  const base = { waitingDays: null as number | null, attempts };
  if (kind === 'final') return { ...base, state: 'final', label: '', tone: 'none', needsAction: false };

  const date = opp.followUpDate;
  if (kind === 'nossa_vez') {
    if (!date) return { ...base, state: 'livre', label: '', tone: 'none', needsAction: false };
    if (date < today) return { ...base, state: 'pendente', label: `Pendente desde ${formatShortDate(date)}`, tone: 'warning', needsAction: true };
    if (date === today) return { ...base, state: 'hoje', label: 'Para hoje', tone: 'warning', needsAction: true };
    return { ...base, state: 'agendado', label: `Agendado · ${formatShortDate(date)}`, tone: 'neutral', needsAction: false };
  }

  // Vez do cliente ou pausado: data é um lembrete, nunca um atraso.
  if (date && date <= today) {
    return { ...base, state: 'lembrete', label: date === today ? 'Lembrete para hoje' : `Lembrete desde ${formatShortDate(date)}`, tone: 'accent', needsAction: true };
  }
  if (kind === 'pausado') {
    return { ...base, state: 'pausado', label: date ? `Lembrar em ${formatShortDate(date)}` : 'Para depois', tone: 'neutral', needsAction: false };
  }

  const last = lastSentDate(opp);
  const waitingDays = last ? Math.max(0, dayDiff(last, today)) : null;
  const followUpDays = stageInfo(data, opp.stage)?.followUpDays ?? DEFAULT_FOLLOW_UP_DAYS;
  if (attempts >= MAX_ATTEMPTS) {
    return { ...base, waitingDays, state: 'sem_resposta', label: `${attempts} tentativas sem resposta`, tone: 'neutral', needsAction: false };
  }
  if (followUpDays > 0 && waitingDays !== null && waitingDays >= followUpDays) {
    return { ...base, waitingDays, state: 'follow_up', label: `Hora do follow-up · ${attempts + 1}ª tentativa`, tone: 'accent', needsAction: true };
  }
  if (date) return { ...base, waitingDays, state: 'agendado', label: `Lembrete · ${formatShortDate(date)}`, tone: 'neutral', needsAction: false };
  const label = waitingDays === null ? 'Aguardando o cliente' : waitingDays === 0 ? 'Aguardando desde hoje' : `Aguardando há ${waitingDays} ${waitingDays === 1 ? 'dia' : 'dias'}`;
  return { ...base, waitingDays, state: 'aguardando', label, tone: 'neutral', needsAction: false };
}

export function needsAction(data: Pick<AppData, 'pipelineStages'>, opp: Opportunity, today: ISODate): boolean {
  return followStatus(data, opp, today).needsAction;
}

/** Leads que pedem ação hoje (para o menu, o Painel e o topo do Comercial). */
export function actionNeeded(data: AppData, today: ISODate, ownerId?: ID): Opportunity[] {
  return data.opportunities.filter((o) => (!ownerId || o.ownerIds.includes(ownerId)) && needsAction(data, o, today));
}

// ---------------------------------------------------------------- Números do topo

export type CommercialPeriod = '7d' | '30d' | 'mes' | 'tudo';

export const COMMERCIAL_PERIODS: Array<{ value: CommercialPeriod; label: string }> = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: 'tudo', label: 'Tudo' },
];

export function commercialRange(period: CommercialPeriod, today: ISODate): { from: ISODate; to: ISODate } {
  switch (period) {
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case 'mes':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'tudo':
      return { from: '0000-01-01', to: today };
  }
}

export interface CommercialMetrics {
  /** Leads em trabalho (sem os pausados e os finalizados). */
  active: number;
  paused: number;
  /** Mensagens/contatos enviados no período. */
  sent: number;
  /** Leads diferentes que receberam contato no período. */
  contacted: number;
  /** Desses, quantos responderam (em qualquer momento depois). */
  replied: number;
  replyRate: number | null;
  /** Leads em etapa "vez do cliente". */
  waiting: number;
  /** Leads que pedem ação hoje. */
  actionToday: number;
  won: number;
  wonValue: number;
  lost: number;
  /** Contatos enviados hoje (para a meta diária). */
  sentToday: number;
}

function closedDate(opp: Opportunity): ISODate | null {
  return opp.closedAt ?? null;
}

export function commercialMetrics(data: AppData, period: CommercialPeriod, today: ISODate, ownerId?: ID): CommercialMetrics {
  const { from, to } = commercialRange(period, today);
  const inRange = (d: ISODate | null | undefined) => Boolean(d && d >= from && d <= to);
  const m: CommercialMetrics = { active: 0, paused: 0, sent: 0, contacted: 0, replied: 0, replyRate: null, waiting: 0, actionToday: 0, won: 0, wonValue: 0, lost: 0, sentToday: 0 };
  for (const o of data.opportunities) {
    if (ownerId && !o.ownerIds.includes(ownerId)) continue;
    const kind = stageKind(data, o.stage);
    if (kind === 'final') {
      if (inRange(closedDate(o))) {
        if (o.stage === WON_STAGE) {
          m.won++;
          m.wonValue += o.estimatedValue ?? 0;
        } else if (o.stage === LOST_STAGE) m.lost++;
      }
    } else if (kind === 'pausado') m.paused++;
    else {
      m.active++;
      if (kind === 'vez_cliente') m.waiting++;
    }
    if (needsAction(data, o, today)) m.actionToday++;

    const sent = sentContacts(o);
    const sentIn = sent.filter((c) => inRange(c.date));
    m.sent += sentIn.length;
    m.sentToday += sent.filter((c) => c.date === today).length;
    if (sentIn.length) {
      m.contacted++;
      const first = sentIn.map((c) => c.date).sort()[0];
      const reply = contactLog(o).some((c) => c.direction === 'recebido' && c.date >= first) || Boolean(o.repliedAt && o.repliedAt >= first);
      if (reply) m.replied++;
    }
  }
  m.replyRate = m.contacted ? (m.replied / m.contacted) * 100 : null;
  return m;
}

// ---------------------------------------------------------------- Relatórios

export interface ReportRow {
  label: string;
  count: number;
  /** Fecharam (para taxa de conversão). */
  won: number;
  /** Responderam (para taxa de resposta). */
  replied: number;
  /** Receberam contato. */
  contacted: number;
}

function groupRows(list: Opportunity[], key: (o: Opportunity) => string): ReportRow[] {
  const map = new Map<string, ReportRow>();
  for (const o of list) {
    const label = key(o) || 'Não informado';
    const row = map.get(label) ?? { label, count: 0, won: 0, replied: 0, contacted: 0 };
    row.count++;
    if (o.stage === WON_STAGE || o.clientId) row.won++;
    if (lastReplyDate(o)) row.replied++;
    if (sentContacts(o).length || lastReplyDate(o)) row.contacted++;
    map.set(label, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'pt-BR'));
}

export interface CommercialReport {
  lostReasons: Array<{ label: string; count: number }>;
  lostWithoutReason: number;
  bySource: ReportRow[];
  bySegment: ReportRow[];
  /** Contatos enviados por semana (últimas 8 semanas). */
  weekly: Array<{ weekStart: ISODate; sent: number; replies: number }>;
  /** Dias, em média, do cadastro até fechar. */
  avgDaysToClose: number | null;
  /** Tentativas, em média, até a primeira resposta. */
  avgAttemptsToReply: number | null;
}

export function commercialReport(data: AppData, today: ISODate): CommercialReport {
  const lost = data.opportunities.filter((o) => o.stage === LOST_STAGE);
  const reasons = new Map<string, number>();
  let lostWithoutReason = 0;
  for (const o of lost) {
    if (!o.lostReason) lostWithoutReason++;
    else reasons.set(o.lostReason, (reasons.get(o.lostReason) ?? 0) + 1);
  }

  const weekly: CommercialReport['weekly'] = [];
  // Semana começando na segunda-feira.
  const weekday = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;
  const thisWeek = addDays(today, -weekday);
  for (let i = 7; i >= 0; i--) weekly.push({ weekStart: addDays(thisWeek, -7 * i), sent: 0, replies: 0 });
  const bucket = (date: ISODate) => weekly.find((w) => date >= w.weekStart && date <= addDays(w.weekStart, 6));
  for (const o of data.opportunities) {
    for (const c of sentContacts(o)) {
      const w = bucket(c.date);
      if (w) w.sent++;
    }
    const replies = contactLog(o).filter((c) => c.direction === 'recebido').map((c) => c.date);
    for (const d of replies.length ? replies : o.repliedAt ? [o.repliedAt] : []) {
      const w = bucket(d);
      if (w) w.replies++;
    }
  }

  const won = data.opportunities.filter((o) => o.stage === WON_STAGE && o.closedAt);
  const avgDaysToClose = won.length ? won.reduce((s, o) => s + Math.max(0, diffInDays(o.createdAt.slice(0, 10), o.closedAt!)), 0) / won.length : null;

  const attempts: number[] = [];
  for (const o of data.opportunities) {
    const firstReply = contactLog(o).filter((c) => c.direction === 'recebido').map((c) => c.date).sort()[0];
    if (!firstReply) continue;
    attempts.push(contactLog(o).filter((c) => c.direction === 'enviado' && c.date <= firstReply).length || 1);
  }
  const avgAttemptsToReply = attempts.length ? attempts.reduce((a, b) => a + b, 0) / attempts.length : null;

  return {
    lostReasons: [...reasons.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    lostWithoutReason,
    bySource: groupRows(data.opportunities, (o) => o.source),
    bySegment: groupRows(data.opportunities, (o) => o.segment.trim()),
    weekly,
    avgDaysToClose,
    avgAttemptsToReply,
  };
}

// ---------------------------------------------------------------- WhatsApp

/** Número no formato do link do WhatsApp (com 55 do Brasil). `null` se não der para usar. */
export function whatsappNumber(phone: string | undefined): string | null {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith('55')) return digits;
  return null;
}

/** Troca {empresa}, {contato} e {meu_nome} pelo que está no cadastro. */
export function fillTemplate(text: string, values: { company: string; contact: string; me: string }): string {
  const firstName = values.contact.trim().split(/\s+/)[0] ?? '';
  return text
    .replace(/\{\s*empresa\s*\}/gi, values.company)
    .replace(/\{\s*contato\s*\}/gi, firstName || values.company)
    .replace(/\{\s*meu_nome\s*\}/gi, values.me)
    .replace(/\[\s*(nome|nome do contato)\s*\]/gi, firstName || values.company)
    .replace(/\[\s*empresa\s*\]/gi, values.company);
}

export function whatsappLink(phone: string | undefined, text: string): string | null {
  const number = whatsappNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
