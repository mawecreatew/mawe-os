import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { addDays, monthKey, shiftMonth, todayISO } from '../src/core/dates.ts';
import { createDemoData, createEmptyData } from '../src/data/seed.ts';
import {
  acceptProposal,
  campaignState,
  costPerResult,
  goalsFor,
  monthAdSpend,
  monthIndicators,
  saveCampaign,
  saveContent,
  saveProposal,
  saveService,
  setMonthlyGoals,
  setProposalStatus,
  toggleServiceActive,
} from '../src/domain/business.ts';
import {
  deleteFinanceEntry,
  financeMovements,
  monthRevenue,
  monthSummary,
  payRecurringOccurrence,
  recurringDates,
  saveFinanceEntry,
  saveRecurring,
  toggleFinanceEntryPaid,
  upcomingBills,
} from '../src/domain/finance.ts';
import { openStages, pipelineStages, WITHDRAWAL_CATEGORY } from '../src/domain/labels.ts';
import {
  addPipelineStage,
  createOpportunity,
  createProject,
  deleteProject,
  movePipelineStage,
  planMonths,
  removePipelineStage,
  renewMonthlyPlan,
  setOpportunityMilestone,
  toggleInstallmentPaid,
  updatePipelineStage,
  type ActionContext,
} from '../src/domain/operations.ts';
import { normalizeData } from '../src/domain/people.ts';
import { pipelineSummary } from '../src/domain/selectors.ts';
import type { AppData } from '../src/domain/types.ts';

const NOW = new Date(2026, 9, 28, 9, 0); // 28/10/2026, 9h
const TODAY = todayISO(NOW);
const MONTH = monthKey(TODAY);
const ctx: ActionContext = { userId: 'maria', now: NOW };

let data: AppData;
beforeEach(() => {
  data = createDemoData(NOW);
});

describe('dados salvos por versões anteriores', () => {
  function legacy(): AppData {
    const old = createEmptyData(NOW) as Partial<AppData> & AppData;
    for (const key of ['pipelineStages', 'finance', 'contents', 'campaigns', 'services', 'proposals', 'goals'] as const) delete old[key];
    old.clients.push({ id: 'cli_x', company: 'Cliente X', contactName: '', segment: '', contact: {}, city: '', contractStatus: 'em_andamento', installments: [], pendingItems: [], nextStep: '', notes: '', createdAt: NOW.toISOString() });
    old.projects.push({ id: 'prj_x', name: 'Site X', clientId: 'cli_x', ownerIds: ['maria'], status: 'em_andamento', startDate: TODAY, dueDate: TODAY, description: '', stages: [], checklist: [], links: { repository: '', production: '', staging: '' }, createdAt: NOW.toISOString() } as unknown as AppData['projects'][number]);
    old.opportunities.push({ id: 'opp_x', contactName: '', company: 'Lead X', segment: '', source: 'Instagram', contact: {}, stage: 'etapa_que_nao_existe', estimatedValue: null, nextAction: '', followUpDate: null, ownerIds: ['maria'], notes: '', history: [], clientId: null, createdAt: NOW.toISOString() });
    return old;
  }

  it('completa os campos novos sem perder nada e sempre do mesmo jeito (sincronização)', () => {
    const a = normalizeData(legacy());
    const b = normalizeData(legacy());
    assert.deepEqual(a, b, 'dois navegadores precisam chegar ao mesmo resultado');
    assert.deepEqual(normalizeData(structuredClone(a)), a, 'rodar de novo não muda nada');
    assert.equal(a.projects[0].type, 'site');
    assert.deepEqual(a.finance, { entries: [], recurring: [] });
    assert.ok(a.services.length >= 9, 'catálogo inicial com a tabela de preços');
    assert.equal(a.services.find((s) => s.id === 'svc_essencial')?.price, 49);
    assert.equal(pipelineStages(a).at(-1)?.id, 'perdido');
    assert.equal(a.opportunities[0].stage, pipelineStages(a)[0].id, 'etapa inexistente volta para a primeira');
  });
});

describe('funil configurável', () => {
  it('adiciona etapa antes de Ganho e Perdido, renomeia e reordena', () => {
    const stage = addPipelineStage(data, 'Reunião marcada', 'info');
    const ids = pipelineStages(data).map((s) => s.id);
    assert.deepEqual(ids.slice(-3), [stage.id, 'ganho', 'perdido']);
    updatePipelineStage(data, stage.id, { label: 'Reunião agendada' });
    assert.equal(pipelineStages(data).find((s) => s.id === stage.id)?.label, 'Reunião agendada');
    movePipelineStage(data, stage.id, -1);
    assert.equal(openStages(data).at(-2), stage.id);
    assert.throws(() => movePipelineStage(data, 'ganho', -1), /fim do funil/);
    assert.throws(() => addPipelineStage(data, 'reunião AGENDADA'), /Já existe/);
  });

  it('Ganho e Perdido podem ser renomeados mas continuam finais e contando nos resumos', () => {
    updatePipelineStage(data, 'ganho', { label: 'Fechado', tone: 'info' });
    assert.equal(pipelineStages(data).at(-2)?.label, 'Fechado');
    assert.equal(pipelineStages(data).at(-2)?.tone, 'success', 'cor das etapas finais é fixa');
    assert.throws(() => removePipelineStage(data, 'perdido', 'identificada', ctx), /finais/);
    const before = pipelineSummary(data, TODAY);
    assert.ok(before.wonCount > 0 && before.lostCount > 0);
  });

  it('remove etapa movendo as oportunidades, com histórico, sem perder nenhuma', () => {
    const inStage = data.opportunities.filter((o) => o.stage === 'negociacao');
    assert.ok(inStage.length > 0);
    const total = data.opportunities.length;
    assert.throws(() => removePipelineStage(data, 'negociacao', null, ctx), /Escolha para qual etapa/);
    const moved = removePipelineStage(data, 'negociacao', 'qualificada', ctx);
    assert.equal(moved, inStage.length);
    assert.equal(data.opportunities.length, total);
    for (const o of inStage) {
      const now = data.opportunities.find((x) => x.id === o.id)!;
      assert.equal(now.stage, 'qualificada');
      assert.match(now.history.at(-1)!.text, /removida do funil/);
    }
    assert.ok(!pipelineStages(data).some((s) => s.id === 'negociacao'));
    assert.throws(() => createOpportunity(data, { contactName: '', company: 'X', segment: '', source: 'Outro', contact: {}, stage: 'negociacao', estimatedValue: null, nextAction: '', followUpDate: null, ownerIds: ['maria'], notes: '' }, ctx), /Etapa do funil/);
  });

  it('não deixa o funil sem etapa aberta', () => {
    for (const id of openStages(data).slice(1)) {
      const target = openStages(data)[0];
      removePipelineStage(data, id, target, ctx);
    }
    assert.throws(() => removePipelineStage(data, openStages(data)[0], 'ganho', ctx), /pelo menos uma etapa aberta/);
  });
});

describe('projetos por tipo', () => {
  it('cada tipo tem suas etapas e checklist; site continua igual', () => {
    const site = createProject(data, { name: 'Site', clientId: 'cli_trigo', ownerIds: ['maria'], status: 'planejamento', startDate: TODAY, dueDate: addDays(TODAY, 10), description: '' }, ctx);
    assert.equal(site.type, 'site');
    assert.equal(site.stages.length, 6);
    const pack = createProject(data, { name: 'Pacote', clientId: 'cli_trigo', ownerIds: ['maria'], status: 'planejamento', startDate: TODAY, dueDate: addDays(TODAY, 10), description: '', type: 'pacote_conteudo' }, ctx, { extraChecklist: ['8 posts no feed'] });
    assert.deepEqual(pack.stages.map((s) => s.name), ['Briefing', 'Criação das artes', 'Aprovação', 'Entrega / postagem']);
    assert.ok(pack.checklist.some((c) => c.text === '8 posts no feed'));
  });

  it('plano mensal é nomeado pelo mês e renova para o mês seguinte mantendo o histórico', () => {
    const plan = createProject(data, { name: 'Plano Essencial', clientId: 'cli_trigo', ownerIds: ['wesley'], status: 'em_andamento', startDate: '', dueDate: '', description: '', type: 'plano_mensal', period: '2026-11', extra: { amount: 49, billingDay: 10 } }, ctx);
    assert.equal(plan.name, 'Plano Essencial – Padaria Trigo Fino – Novembro/2026');
    assert.equal(plan.dueDate, '2026-11-30');
    plan.checklist[0].done = true;
    plan.stages[0].status = 'concluida';
    const next = renewMonthlyPlan(data, plan.id, ctx);
    assert.equal(next.name, 'Plano Essencial – Padaria Trigo Fino – Dezembro/2026');
    assert.equal(next.period, '2026-12');
    assert.equal(next.dueDate, '2026-12-31');
    assert.ok(next.checklist.every((c) => !c.done) && next.stages.every((s) => s.status === 'pendente'));
    assert.equal(next.extra.amount, 49);
    assert.deepEqual(planMonths(data, plan).map((p) => p.period), ['2026-12', '2026-11']);
    assert.throws(() => renewMonthlyPlan(data, 'prj_trigo', ctx), /Só planos mensais/);
  });

  it('excluir projeto remove decisões dele e solta tarefas, conteúdos e propostas', () => {
    const task = data.tasks.find((t) => t.related?.type === 'project')!;
    const projectId = task.related!.id;
    data.decisions.push({ id: 'dec_t', date: TODAY, authorId: 'maria', title: 'x', context: '', projectId });
    saveContent(data, null, { title: 'Post', clientId: data.projects.find((p) => p.id === projectId)!.clientId, projectId, date: TODAY, time: '', network: 'Instagram', format: 'Story', caption: '', artLink: '', notes: '', status: 'ideia' }, ctx);
    deleteProject(data, projectId);
    assert.ok(!data.projects.some((p) => p.id === projectId));
    assert.equal(data.tasks.find((t) => t.id === task.id)?.related, null);
    assert.ok(!data.decisions.some((d) => d.projectId === projectId));
    assert.ok(data.contents.every((c) => c.projectId !== projectId));
  });
});

describe('financeiro', () => {
  it('parcelas de clientes aparecem sozinhas como entradas', () => {
    const list = financeMovements(data, addDays(TODAY, -40), addDays(TODAY, 40));
    const inst = list.filter((m) => m.source === 'installment');
    const all = data.clients.flatMap((c) => c.installments).filter((i) => (i.paidAt ?? i.dueDate) >= addDays(TODAY, -40) && (i.paidAt ?? i.dueDate) <= addDays(TODAY, 40));
    assert.equal(inst.length, all.length);
    assert.ok(inst.every((m) => m.kind === 'entrada' && m.category === 'Clientes'));
  });

  it('despesa recorrente gera vencimentos todo mês sem cadastrar de novo; pagar e desfazer', () => {
    data.finance = { entries: [], recurring: [] };
    const rec = saveRecurring(data, null, { description: 'Claude Pro', amount: 110, category: 'Ferramentas', frequency: 'mensal', startDate: '2026-09-30', paidBy: 'agencia', active: true }, ctx);
    assert.deepEqual(recurringDates(rec, '2026-10-01', '2027-01-31'), ['2026-10-30', '2026-11-30', '2026-12-30', '2027-01-30']);
    const feb = financeMovements(data, '2027-02-01', '2027-02-28').filter((m) => m.recurringId === rec.id);
    assert.equal(feb[0].dueDate, '2027-02-28', 'mês curto usa o último dia');
    const entry = payRecurringOccurrence(data, rec.id, '2026-10-30', TODAY, ctx);
    assert.equal(monthSummary(data, '2026-10').paid, 110);
    assert.equal(financeMovements(data, '2026-10-01', '2026-10-31').filter((m) => m.recurringId === rec.id).length, 1, 'não duplica');
    toggleFinanceEntryPaid(data, entry.id, TODAY);
    assert.equal(monthSummary(data, '2026-10').paid, 0);
    assert.equal(monthSummary(data, '2026-10').toPay, 110, 'volta a ser calculada como a pagar');
    const yearly = saveRecurring(data, null, { description: 'Domínio', amount: 40, category: 'Domínio', frequency: 'anual', startDate: '2026-10-15', paidBy: 'agencia', active: true }, ctx);
    assert.deepEqual(recurringDates(yearly, '2026-01-01', '2028-12-31'), ['2026-10-15', '2027-10-15', '2028-10-15']);
  });

  it('registra quem pagou do próprio bolso e resume o mês', () => {
    data.finance = { entries: [], recurring: [] };
    for (const c of data.clients) c.installments = [];
    saveFinanceEntry(data, null, { kind: 'saida', description: 'Canva', amount: 35, dueDate: TODAY, paidAt: TODAY, category: 'Ferramentas', paidBy: 'wesley', clientId: null, notes: '' }, ctx);
    const out = saveFinanceEntry(data, null, { kind: 'saida', description: 'DAS', amount: 75, dueDate: addDays(TODAY, 2), paidAt: null, category: 'Impostos', paidBy: 'agencia', clientId: null, notes: '' }, ctx);
    saveFinanceEntry(data, null, { kind: 'entrada', description: 'Arte', amount: 200, dueDate: TODAY, paidAt: TODAY, category: 'Serviço avulso', paidBy: 'maria', clientId: null, notes: '' }, ctx);
    const s = monthSummary(data, MONTH);
    assert.deepEqual([s.received, s.paid, s.balance, s.toPay], [200, 35, 165, 75]);
    assert.deepEqual(s.paidByPartner, { wesley: 35 });
    assert.equal(monthSummary(data, MONTH, 'Impostos').toPay, 75, 'filtro por categoria');
    assert.ok(upcomingBills(data, TODAY, 7).some((m) => m.entryId === out.id));
    assert.throws(() => saveFinanceEntry(data, null, { kind: 'saida', description: 'x', amount: 0, dueDate: TODAY, paidAt: null, category: 'Outros', paidBy: 'agencia', clientId: null, notes: '' }, ctx), /maior que zero/);
    assert.throws(() => saveFinanceEntry(data, null, { kind: 'saida', description: 'x', amount: 1, dueDate: TODAY, paidAt: null, category: 'Outros', paidBy: 'alguem', clientId: null, notes: '' }, ctx), /quem pagou/);
    deleteFinanceEntry(data, out.id);
    assert.equal(monthSummary(data, MONTH).toPay, 0);
  });

  it('retirada dos sócios fica fora das despesas e do lucro', () => {
    data.finance = { entries: [], recurring: [] };
    for (const c of data.clients) c.installments = [];
    saveFinanceEntry(data, null, { kind: 'entrada', description: 'Site', amount: 1000, dueDate: TODAY, paidAt: TODAY, category: 'Serviço avulso', paidBy: 'agencia', clientId: null, notes: '' }, ctx);
    saveFinanceEntry(data, null, { kind: 'saida', description: 'Hospedagem', amount: 100, dueDate: TODAY, paidAt: TODAY, category: 'Hospedagem', paidBy: 'agencia', clientId: null, notes: '' }, ctx);
    saveFinanceEntry(data, null, { kind: 'saida', description: 'Lucro', amount: 300, dueDate: TODAY, paidAt: TODAY, category: WITHDRAWAL_CATEGORY, paidBy: 'maria', clientId: null, notes: '' }, ctx);
    saveFinanceEntry(data, null, { kind: 'saida', description: 'Lucro', amount: 200, dueDate: TODAY, paidAt: null, category: WITHDRAWAL_CATEGORY, paidBy: 'wesley', clientId: null, notes: '' }, ctx);
    const s = monthSummary(data, MONTH);
    assert.deepEqual([s.received, s.paid, s.profit, s.withdrawn, s.toWithdraw, s.balance], [1000, 100, 900, 300, 200, 600]);
    assert.deepEqual(s.withdrawnByPartner, { maria: 300 });
    assert.deepEqual(s.paidByPartner, {}, 'retirada não é "pago do bolso"');
    assert.throws(() => saveFinanceEntry(data, null, { kind: 'saida', description: 'x', amount: 1, dueDate: TODAY, paidAt: TODAY, category: WITHDRAWAL_CATEGORY, paidBy: 'agencia', clientId: null, notes: '' }, ctx), /qual sócio/);
  });

  it('faturamento do mês soma parcelas recebidas e entradas avulsas', () => {
    data.finance = { entries: [], recurring: [] };
    for (const c of data.clients) c.installments = [];
    const client = data.clients[0];
    client.installments.push({ id: 'par_t', description: 'Entrada', amount: 300, dueDate: TODAY, paidAt: null, method: 'Pix' });
    assert.equal(monthRevenue(data, MONTH), 0);
    toggleInstallmentPaid(data, client.id, 'par_t', TODAY);
    assert.equal(monthRevenue(data, MONTH), 300);
  });
});

describe('serviços, propostas e metas', () => {
  it('serviço pode ser desativado sem excluir', () => {
    const s = saveService(data, null, { name: 'Pacote de feed', category: 'conteudo', includes: '8 posts\n4 stories', price: 350, billing: 'unico', deliveryDays: 5, active: true });
    toggleServiceActive(data, s.id);
    assert.equal(data.services.find((x) => x.id === s.id)?.active, false);
    assert.throws(() => saveService(data, null, { name: 'pacote de FEED', category: 'conteudo', includes: '', price: 1, billing: 'unico', deliveryDays: null, active: true }), /Já existe/);
  });

  it('proposta calcula total; aceita para oportunidade cria cliente, projetos por tipo e parcelas 50/50', () => {
    const opp = data.opportunities.find((o) => o.id === 'opp_aurora')!;
    const p = saveProposal(data, null, {
      title: '',
      clientId: null,
      opportunityId: opp.id,
      items: [{ serviceId: 'svc_landing', price: 650 }, { serviceId: 'svc_essencial' }],
      validUntil: null,
      startDate: '2026-11-03',
      paymentTerms: '50% no início e 50% na entrega',
      contractLink: 'drive.google.com/x',
      notes: '',
    }, ctx);
    assert.equal(p.title, 'Proposta – Aurora Contabilidade');
    setProposalStatus(data, p.id, 'enviada', TODAY);
    assert.equal(data.proposals.find((x) => x.id === p.id)?.sentAt, TODAY);
    const result = acceptProposal(data, p.id, { createProjects: true, createInstallments: true }, TODAY, ctx);
    const client = data.clients.find((c) => c.id === result.clientId)!;
    assert.equal(client.company, 'Aurora Contabilidade');
    assert.deepEqual(result.projects.map((x) => x.type), ['site', 'plano_mensal']);
    assert.equal(result.projects[1].extra.amount, 49);
    assert.deepEqual(client.installments.map((i) => i.amount), [325, 325]);
    assert.equal(client.installments[0].dueDate, '2026-11-03');
    assert.equal(data.opportunities.find((o) => o.id === opp.id)?.stage, 'ganho');
    assert.equal(monthIndicators(data, MONTH).proposalsAccepted >= 1, true);
  });

  it('metas do mês herdam do mês anterior e indicadores contam contatos por origem', () => {
    setMonthlyGoals(data, shiftMonth(MONTH, -1), { revenue: 2000, newClients: 1, contacts: 20, proposalsSent: 3, proposalsAccepted: 1 });
    const next = goalsFor(data, shiftMonth(MONTH, 1));
    assert.equal(next.inherited, true);
    for (const o of data.opportunities) {
      o.contactedAt = null;
      o.repliedAt = null;
    }
    const gm = data.opportunities.filter((o) => o.source === 'Google Maps');
    const ig = data.opportunities.filter((o) => o.source === 'Instagram');
    setOpportunityMilestone(data, gm[0].id, 'contactedAt', TODAY, ctx);
    setOpportunityMilestone(data, gm[1].id, 'repliedAt', TODAY, ctx); // responder já marca o contato
    setOpportunityMilestone(data, ig[0].id, 'contactedAt', addDays(TODAY, -40), ctx); // outro mês
    const ind = monthIndicators(data, MONTH);
    assert.equal(ind.contacts.total, 2);
    assert.equal(ind.contacts.bySource['Google Maps'], 2);
    assert.equal(ind.replies.bySource['Google Maps'], 1);
    assert.equal(ind.contacts.bySource.Instagram, undefined);
  });
});

describe('tráfego pago', () => {
  it('custo por resultado e investimento do mês proporcional aos dias', () => {
    data.campaigns = [];
    const c = saveCampaign(data, null, { name: 'Teste', clientId: null, platform: 'Meta Ads', objective: 'Mensagens', startDate: '2026-10-27', endDate: '2026-11-05', budget: 100, spent: 100, reach: 1000, clicks: 50, results: 20, learnings: '' }, ctx);
    assert.equal(costPerResult(c), 5);
    assert.equal(monthAdSpend(data, '2026-10', TODAY), 50); // 5 de 10 dias em outubro
    assert.equal(monthAdSpend(data, '2026-11', TODAY), 50);
    assert.equal(campaignState(c, TODAY), 'ativa');
    assert.throws(() => saveCampaign(data, null, { ...c, endDate: '2026-10-01' }, ctx), /depois do início/);
  });
});
