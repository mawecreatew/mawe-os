/**
 * Completa dados salvos por versões anteriores do Mawe OS com os campos novos
 * (funil configurável, financeiro, tipos de projeto, calendário, tráfego,
 * serviços, propostas e metas). Não apaga nada e pode rodar várias vezes:
 * o resultado é sempre o mesmo (importante para a sincronização entre sócios).
 */
import { DEFAULT_PIPELINE_STAGES, FINAL_STAGES, LOST_STAGE, WON_STAGE } from './labels.ts';
import { STARTER_SERVICES } from './templates.ts';
import type { AppData, PipelineStage } from './types.ts';

/** Garante que `ganho` e `perdido` existam e fiquem no fim, nessa ordem. */
export function fixFinalStages(stages: PipelineStage[]): PipelineStage[] {
  const open = stages.filter((s) => !FINAL_STAGES.includes(s.id));
  const won = stages.find((s) => s.id === WON_STAGE) ?? DEFAULT_PIPELINE_STAGES.find((s) => s.id === WON_STAGE)!;
  const lost = stages.find((s) => s.id === LOST_STAGE) ?? DEFAULT_PIPELINE_STAGES.find((s) => s.id === LOST_STAGE)!;
  return [...open, { ...won, tone: 'success' }, { ...lost, tone: 'danger' }];
}

export function fillDefaults(data: AppData): AppData {
  const d = data as Partial<AppData> & AppData;
  d.pipelineStages = fixFinalStages(Array.isArray(d.pipelineStages) && d.pipelineStages.length ? d.pipelineStages : structuredClone(DEFAULT_PIPELINE_STAGES));
  // Oportunidade numa etapa que não existe mais volta para a primeira etapa aberta.
  const known = new Set(d.pipelineStages.map((s) => s.id));
  for (const o of d.opportunities) {
    if (!known.has(o.stage)) o.stage = d.pipelineStages[0].id;
    if (o.contactedAt === undefined) o.contactedAt = null;
    if (o.repliedAt === undefined) o.repliedAt = null;
  }
  for (const p of d.projects) {
    if (!p.type) p.type = 'site';
    p.extra = Object.assign({ artsFolder: '', social: '', amount: null, billingDay: null }, p.extra);
    if (p.period === undefined) p.period = null;
    if (p.seriesId === undefined) p.seriesId = null;
    if (p.serviceId === undefined) p.serviceId = null;
  }
  if (!d.finance || typeof d.finance !== 'object') d.finance = { entries: [], recurring: [] };
  if (!Array.isArray(d.finance.entries)) d.finance.entries = [];
  if (!Array.isArray(d.finance.recurring)) d.finance.recurring = [];
  if (!Array.isArray(d.contents)) d.contents = [];
  if (!Array.isArray(d.campaigns)) d.campaigns = [];
  if (!Array.isArray(d.services)) d.services = structuredClone(STARTER_SERVICES);
  if (!Array.isArray(d.proposals)) d.proposals = [];
  if (!d.goals || typeof d.goals !== 'object') d.goals = {};
  return d;
}
