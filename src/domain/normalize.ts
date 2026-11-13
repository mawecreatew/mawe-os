/**
 * Completa dados salvos por versões anteriores do Mawe OS com os campos novos
 * (funil configurável, financeiro, tipos de projeto, calendário, tráfego,
 * serviços, propostas e metas). Não apaga nada e pode rodar várias vezes:
 * o resultado é sempre o mesmo (importante para a sincronização entre sócios).
 */
import { fillCategories } from './categories.ts';
import { fillStageKinds, stageKind } from './commercial.ts';
import { DEFAULT_PIPELINE_STAGES, FINAL_STAGES, LOST_STAGE, WON_STAGE } from './labels.ts';
import { STARTER_SERVICES } from './templates.ts';
import type { AppData, PipelineStage, Service } from './types.ts';

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
  fillStageKinds(d.pipelineStages);
  for (const o of d.opportunities) {
    if (!known.has(o.stage)) o.stage = d.pipelineStages[0].id;
    if (o.contactedAt === undefined) o.contactedAt = null;
    if (o.repliedAt === undefined) o.repliedAt = null;
    if (!Array.isArray(o.contactLog)) o.contactLog = [];
    if (o.lostReason === undefined) o.lostReason = null;
    if (o.closedAt === undefined) {
      // Dados antigos: usa o último registro do histórico como dia do fechamento.
      const last = o.history[o.history.length - 1]?.at ?? o.createdAt;
      o.closedAt = FINAL_STAGES.includes(o.stage) ? last.slice(0, 10) : null;
    }
  }
  for (const c of d.clients) {
    if (!Array.isArray(c.subscriptions)) c.subscriptions = [];
    if (!Array.isArray(c.links)) c.links = [];
    if (c.domain === undefined) c.domain = null;
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
  for (const e of d.finance.entries) if (e.subscriptionId === undefined) e.subscriptionId = null;
  if (d.finance.openingBalance === undefined) d.finance.openingBalance = null;
  if (!Array.isArray(d.finance.reserves)) d.finance.reserves = [];
  if (!Array.isArray(d.finance.reserveMoves)) d.finance.reserveMoves = [];
  if (!Array.isArray(d.contents)) d.contents = [];
  if (!Array.isArray(d.campaigns)) d.campaigns = [];
  if (!Array.isArray(d.services)) d.services = structuredClone(STARTER_SERVICES);
  if (!Array.isArray(d.proposals)) d.proposals = [];
  if (!d.goals || typeof d.goals !== 'object') d.goals = {};
  for (const s of d.services) if (!Array.isArray(s.packageItems)) s.packageItems = [];
  fillCategories(d);
  if (!Array.isArray(d.activity)) d.activity = [];
  if (!Array.isArray(d.meta.migrations)) d.meta.migrations = [];
  runMigrations(d);
  return d;
}

// ---------------------------------------------------------------- Ajustes únicos

/**
 * Cada ajuste roda uma vez só (fica anotado em `meta.migrations`) e é
 * determinístico: os dois sócios chegam exatamente ao mesmo resultado.
 */
const MIGRATIONS: Array<{ id: string; run: (d: AppData) => void }> = [
  {
    // Lembretes antigos em etapas que esperam o cliente (ou pausadas) não são atraso:
    // eram datas de "próxima ação" que já passaram. Saem para não acusar atraso falso.
    id: '2026-11-comercial-lembretes',
    run: (d) => {
      for (const o of d.opportunities) {
        const kind = stageKind(d, o.stage);
        if ((kind === 'vez_cliente' || kind === 'pausado') && o.followUpDate && o.followUpDate < '2026-11-14') o.followUpDate = null;
      }
    },
  },
  {
    // Tabela de preços combinada em nov/2026: Essencial a R$ 49,99, taxa do domínio
    // separada do valor do registro e os pacotes da Black Friday.
    id: '2026-11-servicos',
    run: (d) => {
      const essencial = d.services.find((s) => s.id === 'svc_essencial');
      if (essencial && essencial.price === 49) essencial.price = 49.99;
      const dominio = d.services.find((s) => s.id === 'svc_dominio');
      if (dominio && (dominio.price === 40 || dominio.price === 25)) {
        dominio.price = 25;
        dominio.includes = 'A MaweCreate faz o registro do domínio no nome do cliente\nO domínio custa R$ 40 por ano no registro.br, pago pelo cliente à parte';
      }
      const has = (id: string, name: string) => d.services.some((s) => s.id === id || s.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
      const pack = (s: Service) => {
        if (!has(s.id, s.name)) d.services.push(s);
      };
      pack({
        id: 'svc_pacote_site_google',
        name: 'Site + Google Meu Negócio',
        category: 'pacote',
        includes: 'Site completo com botão de WhatsApp\nPerfil do Google Meu Negócio criado ou organizado\nAté 2 rodadas de alterações',
        price: 750,
        billing: 'unico',
        deliveryDays: 10,
        active: true,
        promoPrice: 450,
        promoUntil: '2026-11-30',
        promoLabel: 'Black Friday',
        packageItems: [],
      });
      pack({
        id: 'svc_pacote_completo',
        name: 'Pacote completo',
        category: 'pacote',
        includes: 'Site completo com botão de WhatsApp\nPerfil do Google Meu Negócio criado ou organizado\nInstagram organizado: bio, destaques e 4 artes\nAté 2 rodadas de alterações',
        price: 1000,
        billing: 'unico',
        deliveryDays: 12,
        active: true,
        promoPrice: 590,
        promoUntil: '2026-11-30',
        promoLabel: 'Black Friday',
        packageItems: [],
      });
    },
  },
];

function runMigrations(d: AppData): void {
  const done = d.meta.migrations!;
  for (const m of MIGRATIONS) {
    if (done.includes(m.id)) continue;
    m.run(d);
    done.push(m.id);
  }
}
