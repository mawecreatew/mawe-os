/**
 * Cadência de prospecção da MaweCreate:
 *
 * Aquecimento (3 dias seguindo, curtindo e comentando) → Pronto pra abordar
 * (primeira mensagem) → Aguardando resposta (follow-ups em 3, 7 e 15 dias) →
 * Negociação (respondeu: briefing e proposta) → Fechou. Quem não responde vai
 * para "Sem resposta" e volta a ser lembrado em 3 meses.
 *
 * Aqui ficam a mudança única das etapas antigas para a cadência, a lista
 * "Quem chamar hoje" e os botões rápidos (Mandei, Respondeu...).
 */
import { addDays, type ISODate } from '../core/dates.ts';
import { normalizeText } from '../core/format.ts';
import { createId } from '../core/id.ts';
import { attemptsWithoutReply, followStatus, logContact, type FollowStatus } from './commercial.ts';
import { DEFAULT_PIPELINE_STAGES, FINAL_STAGES, LOST_STAGE, WON_STAGE, stageLabel } from './labels.ts';
import type { ActionContext } from './operations.ts';
import type { AppData, ContactChannel, ID, Opportunity, PipelineStage } from './types.ts';

export const WARMUP_STAGE = 'aquecimento';
export const APPROACH_STAGE = 'abordar';
export const WAITING_STAGE = 'aguardando';
export const TALKING_STAGE = 'negociacao';
export const LATER_STAGE = 'sem_resposta';
export const CADENCE_STAGE_IDS = [WARMUP_STAGE, APPROACH_STAGE, WAITING_STAGE, TALKING_STAGE, LATER_STAGE];

/** Dias de aquecimento antes da primeira mensagem. */
export const WARMUP_DAYS = 3;
/** Depois de quantos dias um lead "sem resposta" volta a aparecer. */
export const RETRY_DAYS = 90;

export function cadenceStages(): PipelineStage[] {
  return structuredClone(DEFAULT_PIPELINE_STAGES.filter((s) => !FINAL_STAGES.includes(s.id)));
}

/** Para qual etapa da cadência uma etapa antiga vai, pelo nome. `null` = fica como está. */
export function cadenceTargetFor(label: string): string | null {
  const t = normalizeText(label);
  if (/aquec|seguir|curtir|engaj/.test(t)) return WARMUP_STAGE;
  if (/futuro|depois|sem resposta|nao respond|esfri|congel|pausad/.test(t)) return LATER_STAGE;
  if (/reuni|negoci|proposta|briefing|orcament|interess|respond|conversa|decis/.test(t)) return TALKING_STAGE;
  if (/^nov[oa]|a contatar|para contatar|nao contatad|prospec|abordar|abordagem|identificad|analise|qualificad|mapead|encontrad|prepar|^lead/.test(t)) return APPROACH_STAGE;
  if (/follow|aguard|esperando|contat|mensagem|enviad|abordad/.test(t)) return WAITING_STAGE;
  return null;
}

/**
 * Troca as etapas abertas pelas da cadência. Etapas que não combinam com
 * nenhuma (ex.: "Já está fazendo site") continuam no funil, depois das da
 * cadência. Ninguém é apagado. Determinístico: os dois sócios chegam ao mesmo resultado.
 */
export function migrateToCadence(d: AppData): void {
  const has = (id: string) => d.pipelineStages.some((s) => s.id === id);
  if (CADENCE_STAGE_IDS.every(has)) return;
  const moves = new Map<string, string>();
  const kept: PipelineStage[] = [];
  for (const s of d.pipelineStages) {
    if (FINAL_STAGES.includes(s.id)) continue;
    if (CADENCE_STAGE_IDS.includes(s.id)) {
      moves.set(s.id, s.id);
      continue;
    }
    const target = cadenceTargetFor(s.label);
    if (target) moves.set(s.id, target);
    else kept.push(s);
  }
  const won = d.pipelineStages.find((s) => s.id === WON_STAGE);
  const lost = d.pipelineStages.find((s) => s.id === LOST_STAGE);
  const wonDefault = DEFAULT_PIPELINE_STAGES.find((s) => s.id === WON_STAGE)!;
  const lostDefault = DEFAULT_PIPELINE_STAGES.find((s) => s.id === LOST_STAGE)!;
  d.pipelineStages = [
    ...cadenceStages(),
    ...kept,
    { ...wonDefault, label: !won || won.label === 'Ganho' ? wonDefault.label : won.label },
    { ...lostDefault, label: !lost || lost.label === 'Perdido' ? lostDefault.label : lost.label },
  ];
  for (const o of d.opportunities) {
    const target = moves.get(o.stage);
    if (!target || target === o.stage) continue;
    const from = o.stage;
    o.stage = target;
    // Lembretes antigos de etapas de espera não valem na cadência (ela calcula sozinha).
    if (target === WAITING_STAGE) o.followUpDate = null;
    if (target === LATER_STAGE && !o.followUpDate) o.followUpDate = null;
    o.history.push({ id: `his_cad_${o.id}`, at: '2026-11-24T12:00:00.000Z', authorId: o.ownerIds[0] ?? d.users[0]?.id ?? 'maria', text: `Etapa ajustada para a cadência: ${from} → ${stageLabel(d, target)}.` });
  }
}

// ---------------------------------------------------------------- Quem chamar hoje

export type CallGroup = 'primeira' | 'followup' | 'tentar' | 'aquecendo' | 'outros';

export interface CallItem {
  opp: Opportunity;
  group: CallGroup;
  status: FollowStatus;
  /** Texto curto do que fazer ("1º follow-up", "Dia 2 de 3"...). */
  what: string;
}

export const CALL_GROUPS: Array<{ id: CallGroup; title: string; hint: string }> = [
  { id: 'followup', title: 'Follow-up hoje', hint: 'Já mandaram mensagem e chegou o dia de chamar de novo.' },
  { id: 'primeira', title: 'Mandar a primeira mensagem', hint: 'Leads prontos para a abordagem.' },
  { id: 'tentar', title: 'Tentar de novo', hint: 'Não responderam há 3 meses. Vale uma nova abordagem.' },
  { id: 'aquecendo', title: 'Aquecendo no Instagram', hint: 'Seguir, curtir e comentar. A abordagem vem no fim do aquecimento.' },
  { id: 'outros', title: 'Outros lembretes', hint: 'Lembretes das outras etapas do funil.' },
];

function warmupDay(opp: Opportunity, today: ISODate): number {
  if (!opp.followUpDate) return 1;
  const left = Math.round((Date.parse(opp.followUpDate) - Date.parse(today)) / 86_400_000);
  return Math.min(WARMUP_DAYS, Math.max(1, WARMUP_DAYS - left));
}

/** Leads para chamar hoje, separados pelo que precisa ser feito. */
export function callToday(data: AppData, today: ISODate, ownerId?: ID): CallItem[] {
  const items: CallItem[] = [];
  for (const opp of data.opportunities) {
    if (ownerId && !opp.ownerIds.includes(ownerId)) continue;
    if (FINAL_STAGES.includes(opp.stage)) continue;
    const status = followStatus(data, opp, today);
    if (opp.stage === WARMUP_STAGE) {
      if (opp.followUpDate && opp.followUpDate <= today) items.push({ opp, group: 'primeira', status, what: 'Aquecimento concluído' });
      else items.push({ opp, group: 'aquecendo', status, what: `Dia ${warmupDay(opp, today)} de ${WARMUP_DAYS}` });
      continue;
    }
    if (opp.stage === APPROACH_STAGE) {
      if (!opp.followUpDate || opp.followUpDate <= today) items.push({ opp, group: 'primeira', status, what: attemptsWithoutReply(opp) ? 'Nova abordagem' : 'Primeira mensagem' });
      continue;
    }
    if (!status.needsAction) continue;
    if (opp.stage === LATER_STAGE) items.push({ opp, group: 'tentar', status, what: '3 meses depois' });
    else if (opp.stage === WAITING_STAGE || opp.stage === TALKING_STAGE) items.push({ opp, group: 'followup', status, what: status.label });
    else items.push({ opp, group: 'outros', status, what: status.label });
  }
  const order: CallGroup[] = CALL_GROUPS.map((g) => g.id);
  return items.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.opp.company.localeCompare(b.opp.company, 'pt-BR'));
}

/** Quantos leads pedem mensagem hoje (sem contar os que estão só aquecendo). */
export function callTodayCount(data: AppData, today: ISODate, ownerId?: ID): number {
  return callToday(data, today, ownerId).filter((i) => i.group !== 'aquecendo').length;
}

// ---------------------------------------------------------------- Botões rápidos

function find(draft: AppData, id: ID): Opportunity {
  const opp = draft.opportunities.find((o) => o.id === id);
  if (!opp) throw new Error('Lead não encontrado.');
  return opp;
}

function moveTo(draft: AppData, opp: Opportunity, stage: string, ctx: ActionContext): void {
  if (opp.stage === stage) return;
  if (!draft.pipelineStages.some((s) => s.id === stage)) throw new Error('Etapa da cadência não encontrada. Confira as etapas do funil.');
  const from = opp.stage;
  opp.stage = stage;
  opp.history.push({ id: createId('his'), at: ctx.now.toISOString(), authorId: ctx.userId, text: `Etapa alterada: ${stageLabel(draft, from)} → ${stageLabel(draft, stage)}.` });
}

/** Canal provável: quem veio do Instagram é chamado no direct; o resto, no WhatsApp. */
export function defaultChannel(opp: Opportunity): ContactChannel {
  if (/insta/i.test(opp.source) && !opp.contact.phone) return 'instagram';
  return 'whatsapp';
}

/** Começa o aquecimento: 3 dias seguindo, curtindo e comentando. */
export function startWarmup(draft: AppData, oppId: ID, today: ISODate, ctx: ActionContext): void {
  const opp = find(draft, oppId);
  moveTo(draft, opp, WARMUP_STAGE, ctx);
  opp.followUpDate = addDays(today, WARMUP_DAYS - 1);
}

/** "Mandei": registra a mensagem e deixa a cadência cuidar do próximo follow-up. */
export function markSent(draft: AppData, oppId: ID, today: ISODate, ctx: ActionContext, channel?: ContactChannel): void {
  const opp = find(draft, oppId);
  // Em Negociação continua lá; nas outras etapas vai para Aguardando resposta.
  const going = opp.stage === TALKING_STAGE ? TALKING_STAGE : WAITING_STAGE;
  logContact(draft, oppId, { date: today, channel: channel ?? defaultChannel(opp), direction: 'enviado', note: '' }, ctx, { moveTo: going, followUpDate: null });
}

/** "Respondeu": registra a resposta e leva para Negociação. */
export function markReplied(draft: AppData, oppId: ID, today: ISODate, ctx: ActionContext): void {
  const opp = find(draft, oppId);
  logContact(draft, oppId, { date: today, channel: defaultChannel(opp), direction: 'recebido', note: '' }, ctx, { moveTo: TALKING_STAGE, followUpDate: null });
}

/** "Sem resposta": guarda o lead e lembra de novo em 3 meses. */
export function markNoReply(draft: AppData, oppId: ID, today: ISODate, ctx: ActionContext): void {
  const opp = find(draft, oppId);
  moveTo(draft, opp, LATER_STAGE, ctx);
  opp.followUpDate = addDays(today, RETRY_DAYS);
}

/** "Tentar de novo": volta para Pronto pra abordar. */
export function retryLead(draft: AppData, oppId: ID, today: ISODate, ctx: ActionContext): void {
  const opp = find(draft, oppId);
  moveTo(draft, opp, APPROACH_STAGE, ctx);
  opp.followUpDate = null;
  // A cadência recomeça do zero: as tentativas antigas não contam mais.
  opp.cadenceFrom = today;
}

/** "Abordar agora": termina o aquecimento antes da hora. */
export function readyToApproach(draft: AppData, oppId: ID, ctx: ActionContext): void {
  const opp = find(draft, oppId);
  moveTo(draft, opp, APPROACH_STAGE, ctx);
  opp.followUpDate = null;
}
