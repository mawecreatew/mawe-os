/**
 * Completa dados salvos por versões anteriores do Mawe OS com os campos novos
 * (funil configurável, financeiro, tipos de projeto, calendário, tráfego,
 * serviços, propostas e metas). Não apaga nada e pode rodar várias vezes:
 * o resultado é sempre o mesmo (importante para a sincronização entre sócios).
 */
import { fillCategories } from './categories.ts';
import { fillStageKinds, stageKind } from './commercial.ts';
import { DEFAULT_PIPELINE_STAGES, FINAL_STAGES, LOST_STAGE, WON_STAGE } from './labels.ts';
import { starterProcesses } from './processes.ts';
import { STARTER_SERVICES } from './templates.ts';
import type { AppData, LibraryItem, PipelineStage, Service } from './types.ts';

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
    if (!c.afterSales || typeof c.afterSales !== 'object') c.afterSales = {};
  }
  for (const p of d.projects) {
    if (!p.type) p.type = 'site';
    p.extra = Object.assign({ artsFolder: '', social: '', amount: null, billingDay: null }, p.extra);
    if (p.period === undefined) p.period = null;
    if (p.seriesId === undefined) p.seriesId = null;
    if (p.serviceId === undefined) p.serviceId = null;
    if (p.publishedAt === undefined) p.publishedAt = null;
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
  for (const p of d.proposals) if (p.contract === undefined) p.contract = null;
  if (!Array.isArray(d.processes)) d.processes = starterProcesses(d.users.some((u) => u.id === 'maria') ? 'maria' : (d.users[0]?.id ?? 'maria'));
  if (!Array.isArray(d.approvals)) d.approvals = [];
  if (!d.daily || typeof d.daily !== 'object') d.daily = {};
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
  {
    // Mensagens prontas do pós-venda e do aviso de renovação do domínio (usadas
    // pelos lembretes de pós-venda). Ids fixos: os dois sócios geram o mesmo.
    id: '2026-11-posvenda-mensagens',
    run: (d) => {
      const author = d.users.some((u) => u.id === 'maria') ? 'maria' : (d.users[0]?.id ?? 'maria');
      for (const item of AFTER_SALES_MESSAGES) {
        if (!d.library.some((l) => l.id === item.id)) d.library.push({ ...item, authorId: author, updatedAt: '2026-11-23T12:00:00.000Z', ...(d.meta.dataset === 'demo' ? { isDemo: true } : {}) });
      }
    },
  },
];

const AFTER_SALES_MESSAGES: Array<Omit<LibraryItem, 'authorId' | 'updatedAt'>> = [
  {
    id: 'lib_posvenda_7',
    category: 'mensagem',
    title: 'Pós-venda: 7 dias',
    summary: 'Uma semana depois da entrega: saber se está tudo certo e pedir depoimento.',
    content:
      'Oi, {{nome}}! Já faz uma semana que o site da {{empresa}} está no ar. Está tudo certinho? Algum cliente comentou?\n\nSe puder, me manda um áudio ou uma mensagem curtinha contando como foi trabalhar com a gente. Ajuda muito uma agência que está crescendo!',
  },
  {
    id: 'lib_posvenda_30',
    category: 'mensagem',
    title: 'Pós-venda: 30 dias',
    summary: 'Um mês depois: ver se o site traz contatos e oferecer extras.',
    content:
      'Oi, {{nome}}! Um mês de site no ar! Ele já trouxe contatos pelo WhatsApp?\n\nSe quiser movimentar mais, a gente também faz artes de divulgação para o Instagram e o status, e tem planos de manutenção mensal.',
  },
  {
    id: 'lib_posvenda_90',
    category: 'mensagem',
    title: 'Pós-venda: a cada 3 meses',
    summary: 'Mensagem leve para manter contato.',
    content: 'Oi, {{nome}}! Passando para saber como estão as coisas na {{empresa}}. Se tiver novidade (produto, serviço, horário), me avisa que a gente atualiza o site.',
  },
  {
    id: 'lib_dominio_renovacao',
    category: 'mensagem',
    title: 'Aviso de renovação do domínio',
    summary: 'Um mês antes de o domínio vencer.',
    content:
      'Oi, {{nome}}! Lembrete importante: o domínio do site da {{empresa}} vence daqui a um mês. A renovação é feita no Registro.br, no seu nome. Se vencer, o site sai do ar.\n\nQuer que eu te mande o passo a passo?',
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
