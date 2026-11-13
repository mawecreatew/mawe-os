/** Regras novas: de quem é a vez no funil, contatos, categorias, caixa, planos mensais, reservas, promoções e busca. */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { addDays, todayISO } from '../src/core/dates.ts';
import { createEmptyData } from '../src/data/seed.ts';
import { effectivePrice, promoActive, saveService } from '../src/domain/business.ts';
import { addCategory, categories, renameCategory, toggleCategoryArchived } from '../src/domain/categories.ts';
import { actionNeeded, commercialMetrics, followStatus, guessStageKind, logContact, setLostReason, setStageBehavior, whatsappLink } from '../src/domain/commercial.ts';
import {
  cashPosition,
  financeMovements,
  monthByMonth,
  monthlyRecurringRevenue,
  moveReserve,
  paySubscription,
  saveFinanceEntry,
  saveReserve,
  saveSubscription,
  setOpeningBalance,
} from '../src/domain/finance.ts';
import { todayFocus } from '../src/domain/insights.ts';
import { addPipelineStage, createClient, createOpportunity, moveOpportunity, type ActionContext } from '../src/domain/operations.ts';
import { normalizeData } from '../src/domain/people.ts';
import { globalSearch } from '../src/domain/search.ts';
import type { AppData, Opportunity } from '../src/domain/types.ts';

const NOW = new Date(2026, 10, 13, 10, 0); // 13/11/2026
const TODAY = todayISO(NOW);
const ctx: ActionContext = { userId: 'maria', now: NOW };

let data: AppData;
beforeEach(() => {
  data = createEmptyData(NOW);
});

/** Funil parecido com o da MaweCreate. */
function realFunnel(): Record<string, string> {
  const ids: Record<string, string> = {};
  data.pipelineStages = data.pipelineStages.filter((s) => s.id === 'ganho' || s.id === 'perdido');
  for (const label of ['Oportunidade identificada', 'Preparar a mensagem', 'Primeiro contato', 'Aguardando decisão', 'Respondeu', 'Reunião', 'Interessado no futuro']) {
    ids[label] = addPipelineStage(data, label).id;
  }
  return ids;
}

function lead(stage: string, extra: Partial<Opportunity> = {}): Opportunity {
  const o = createOpportunity(data, { contactName: 'Ana', company: `Lead ${data.opportunities.length + 1}`, segment: 'Hamburgueria', source: 'Google Maps', contact: { phone: '(47) 99999-0000' }, stage, estimatedValue: 600, nextAction: '', followUpDate: null, ownerIds: ['maria'], notes: '' }, ctx);
  return Object.assign(o, extra);
}

describe('de quem é a vez no funil', () => {
  it('adivinha o tipo pelo nome da etapa', () => {
    assert.equal(guessStageKind('Preparar a mensagem'), 'nossa_vez');
    assert.equal(guessStageKind('Primeiro contato'), 'vez_cliente');
    assert.equal(guessStageKind('Aguardando decisão'), 'vez_cliente');
    assert.equal(guessStageKind('Reunião'), 'vez_cliente');
    assert.equal(guessStageKind('Interessado no futuro'), 'pausado');
    assert.equal(guessStageKind('Já está fazendo o site'), 'pausado');
  });

  it('lead esperando o cliente ou pausado nunca fica atrasado; só o que depende de vocês', () => {
    const s = realFunnel();
    const ours = lead(s['Preparar a mensagem'], { followUpDate: addDays(TODAY, -5) });
    const waiting = lead(s['Aguardando decisão'], { contactedAt: addDays(TODAY, -10) });
    const future = lead(s['Interessado no futuro'], { followUpDate: null });
    const meeting = lead(s['Reunião'], { contactedAt: addDays(TODAY, -4) });

    assert.equal(followStatus(data, ours, TODAY).state, 'pendente');
    assert.equal(followStatus(data, waiting, TODAY).state, 'aguardando', 'aguardando decisão não cobra follow-up');
    assert.equal(followStatus(data, future, TODAY).state, 'pausado');
    assert.equal(followStatus(data, meeting, TODAY).state, 'aguardando');
    assert.deepEqual(actionNeeded(data, TODAY).map((o) => o.id), [ours.id]);
    const focus = todayFocus(data, TODAY, { finance: false }).filter((i) => i.kind === 'followup');
    assert.equal(focus.length, 1);
    assert.equal(focus[0].overdue, true);
  });

  it('primeiro contato sugere follow-up depois de 3 dias e para depois de 3 tentativas', () => {
    const s = realFunnel();
    const o = lead(s['Primeiro contato']);
    logContact(data, o.id, { date: addDays(TODAY, -4), channel: 'whatsapp', direction: 'enviado', note: '' }, ctx);
    assert.equal(followStatus(data, o, TODAY).state, 'follow_up');
    assert.match(followStatus(data, o, TODAY).label, /2ª tentativa/);
    logContact(data, o.id, { date: addDays(TODAY, -2), channel: 'audio', direction: 'enviado', note: '' }, ctx);
    assert.equal(followStatus(data, o, TODAY).state, 'aguardando');
    logContact(data, o.id, { date: addDays(TODAY, -1), channel: 'ligacao', direction: 'enviado', note: '' }, ctx);
    assert.equal(followStatus(data, o, TODAY).state, 'sem_resposta');
    assert.equal(followStatus(data, o, TODAY).needsAction, false);
    // Etapa configurada com 0 dias: nunca sugere follow-up.
    setStageBehavior(data, s['Primeiro contato'], { followUpDays: 0 });
    const fresh = lead(s['Primeiro contato'], { contactedAt: addDays(TODAY, -20) });
    assert.equal(followStatus(data, fresh, TODAY).needsAction, false);
  });

  it('lembrete em lead pausado aparece no dia como lembrete, não como atraso', () => {
    const s = realFunnel();
    const o = lead(s['Interessado no futuro'], { followUpDate: TODAY });
    const status = followStatus(data, o, TODAY);
    assert.equal(status.state, 'lembrete');
    assert.equal(status.needsAction, true);
    assert.equal(todayFocus(data, TODAY, { finance: false })[0].overdue, false);
  });

  it('atualização limpa lembretes antigos só em etapas que esperam o cliente', () => {
    const s = realFunnel();
    const waiting = lead(s['Aguardando decisão'], { followUpDate: '2026-11-03' });
    const ours = lead(s['Preparar a mensagem'], { followUpDate: '2026-11-09' });
    data.meta.migrations = [];
    normalizeData(data);
    assert.equal(data.opportunities.find((o) => o.id === waiting.id)?.followUpDate, null);
    assert.equal(data.opportunities.find((o) => o.id === ours.id)?.followUpDate, '2026-11-09');
  });
});

describe('contatos e números do Comercial', () => {
  it('conta mensagens enviadas, taxa de resposta, aguardando e fechados no período', () => {
    const s = realFunnel();
    const a = lead(s['Preparar a mensagem']);
    const b = lead(s['Preparar a mensagem']);
    logContact(data, a.id, { date: TODAY, channel: 'whatsapp', direction: 'enviado', note: '' }, ctx, { moveTo: s['Primeiro contato'] });
    logContact(data, b.id, { date: TODAY, channel: 'audio', direction: 'enviado', note: '' }, ctx, { moveTo: s['Primeiro contato'] });
    logContact(data, b.id, { date: TODAY, channel: 'whatsapp', direction: 'recebido', note: 'pediu valor' }, ctx, { moveTo: s['Respondeu'] });
    const won = lead(s['Reunião']);
    moveOpportunity(data, won.id, 'ganho', ctx);
    const m = commercialMetrics(data, 'mes', TODAY);
    assert.equal(m.sent, 2);
    assert.equal(m.sentToday, 2);
    assert.equal(m.contacted, 2);
    assert.equal(m.replied, 1);
    assert.equal(Math.round(m.replyRate!), 50);
    assert.equal(m.waiting, 1, 'só o lead a continua esperando o cliente');
    assert.equal(m.won, 1);
    assert.equal(data.opportunities.find((o) => o.id === won.id)?.closedAt, TODAY);
    assert.equal(data.opportunities.find((o) => o.id === b.id)?.repliedAt, TODAY);
    assert.ok((data.activity ?? []).length > 0, 'ações ficam na atividade da equipe');
  });

  it('motivo de perda fica salvo e some se o lead for reaberto', () => {
    const s = realFunnel();
    const o = lead(s['Aguardando decisão']);
    moveOpportunity(data, o.id, 'perdido', ctx);
    setLostReason(data, [o.id], 'Achou caro', '', ctx);
    assert.equal(o.lostReason, 'Achou caro');
    moveOpportunity(data, o.id, s['Interessado no futuro'], ctx);
    assert.equal(o.lostReason, null);
    assert.equal(o.closedAt, null);
  });

  it('monta o link do WhatsApp com 55 e a mensagem', () => {
    assert.equal(whatsappLink('(47) 99208-0000', 'Oi'), 'https://wa.me/5547992080000?text=Oi');
    assert.equal(whatsappLink('123', 'Oi'), null);
  });
});

describe('categorias editáveis', () => {
  it('cria, renomeia (atualizando os registros) e arquiva', () => {
    const s = realFunnel();
    const o = lead(s['Preparar a mensagem'], { source: 'Google Maps' });
    const item = categories(data, 'origem').find((c) => c.label === 'Google Maps')!;
    renameCategory(data, 'origem', item.id, 'Google');
    assert.equal(o.source, 'Google');
    const nova = addCategory(data, 'servico', 'Identidade visual');
    assert.ok(categories(data, 'servico').some((c) => c.id === nova.id));
    assert.throws(() => addCategory(data, 'servico', 'identidade VISUAL'), /Já existe/);
    toggleCategoryArchived(data, 'servico', nova.id);
    assert.ok(!categories(data, 'servico').some((c) => c.id === nova.id));
    assert.ok(categories(data, 'servico', true).some((c) => c.id === nova.id));
  });
});

describe('caixa, planos mensais e reservas', () => {
  it('caixa soma todos os meses; despesa do bolso do sócio não sai da conta', () => {
    setOpeningBalance(data, 100, '2026-10-01');
    saveFinanceEntry(data, null, { kind: 'entrada', description: 'Site', amount: 350, dueDate: '2026-10-22', paidAt: '2026-10-22', category: 'Serviço avulso', paidBy: 'agencia', clientId: null, notes: '' }, ctx);
    saveFinanceEntry(data, null, { kind: 'entrada', description: 'Sistema', amount: 800, dueDate: '2026-10-30', paidAt: '2026-10-30', category: 'Serviço avulso', paidBy: 'agencia', clientId: null, notes: '' }, ctx);
    saveFinanceEntry(data, null, { kind: 'saida', description: 'Claude', amount: 100, dueDate: TODAY, paidAt: TODAY, category: 'Ferramentas', paidBy: 'agencia', clientId: null, notes: '' }, ctx);
    saveFinanceEntry(data, null, { kind: 'saida', description: 'Domínio', amount: 40, dueDate: TODAY, paidAt: TODAY, category: 'Domínio', paidBy: 'maria', clientId: null, notes: '' }, ctx);
    const cash = cashPosition(data, TODAY);
    assert.equal(cash.balance, 100 + 350 + 800 - 100);
    const rows = monthByMonth(data, TODAY);
    assert.deepEqual(rows.map((r) => r.month), ['2026-10', '2026-11']);
    assert.equal(rows.at(-1)!.cumulative, cash.balance);
    saveReserve(data, null, { name: 'Ferramentas', goal: 300 }, ctx);
    moveReserve(data, data.finance.reserves![0].id, 200, TODAY, '', ctx);
    assert.equal(cashPosition(data, TODAY).free, cash.balance - 200);
    assert.throws(() => moveReserve(data, data.finance.reserves![0].id, -500, TODAY, '', ctx), /não tem esse valor/);
  });

  it('plano mensal gera a cobrança de cada mês e entra na receita recorrente', () => {
    const client = createClient(data, { company: 'The House', contactName: 'Zu', segment: 'Pizzaria', contact: {}, city: '', contractStatus: 'em_andamento', nextStep: '', notes: '' }, ctx);
    const sub = saveSubscription(data, client.id, null, { name: 'Plano Essencial', serviceId: 'svc_essencial', amount: 49.99, billingDay: 3, startMonth: '2026-11', endMonth: null, active: true }, ctx);
    const due = financeMovements(data, '2026-11-01', '2026-12-31').filter((m) => m.subscriptionId === sub.id);
    assert.deepEqual(due.map((m) => m.dueDate), ['2026-11-03', '2026-12-03']);
    assert.equal(monthlyRecurringRevenue(data, '2026-11').total, 49.99);
    paySubscription(data, client.id, sub.id, '2026-11-03', '2026-11-03', ctx);
    assert.equal(financeMovements(data, '2026-11-01', '2026-11-30').filter((m) => m.subscriptionId === sub.id && m.paidAt).length, 1);
    assert.equal(cashPosition(data, TODAY).received, 49.99);
  });
});

describe('promoções e busca', () => {
  it('preço promocional vale até a data e depois volta ao normal', () => {
    const s = saveService(data, null, { name: 'Site Black', category: 'site', includes: '', price: 600, billing: 'unico', deliveryDays: 7, active: true, promoPrice: 350, promoUntil: '2026-11-30', promoLabel: 'Black Friday', packageItems: [] });
    assert.equal(promoActive(s, TODAY), true);
    assert.equal(effectivePrice(s, TODAY), 350);
    assert.equal(effectivePrice(s, '2026-12-01'), 600);
    assert.throws(() => saveService(data, null, { name: 'Errado', category: 'site', includes: '', price: 100, billing: 'unico', deliveryDays: null, active: true, promoPrice: 200, promoUntil: null }), /menor/);
  });

  it('busca leads e clientes sem acento', () => {
    const s = realFunnel();
    lead(s['Preparar a mensagem'], { company: 'Pastelaria São João' } as Partial<Opportunity>);
    data.opportunities.at(-1)!.company = 'Pastelaria São João';
    const results = globalSearch(data, 'sao jo');
    assert.equal(results[0]?.title, 'Pastelaria São João');
    assert.equal(results[0]?.kind, 'lead');
  });
});
