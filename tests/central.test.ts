/** Central MaweCreate (v0.8): cadência, chat, notas, planejamento, clientes, contratos, marketing, horas e backup. */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { addDays, startOfWeek, todayISO } from '../src/core/dates.ts';
import { buildXlsx, crc32 } from '../src/core/xlsx.ts';
import { createDemoData, createEmptyData } from '../src/data/seed.ts';
import { backupSheets } from '../src/domain/backup.ts';
import { cadenceTargetFor, callToday, markNoReply, markReplied, markSent, migrateToCadence, retryLead, startWarmup } from '../src/domain/cadence.ts';
import {
  addClientFile,
  clientSource,
  clientsAZ,
  contractState,
  contractsEndingSoon,
  inOnboarding,
  indexLetter,
  onboardingProgress,
  referrals,
  removeClientFile,
  renewContract,
  saveAccess,
  saveBriefing,
  saveClientOrigin,
  saveContract,
  toggleOnboarding,
} from '../src/domain/clientcare.ts';
import { followStatus, logContact } from '../src/domain/commercial.ts';
import { addPrioritySlot, prioritiesOf, removePrioritySlot, setPriority } from '../src/domain/daily.ts';
import { todayFocus } from '../src/domain/insights.ts';
import { quickQuote, quoteMessage } from '../src/domain/kit.ts';
import { followersByYear, instagramGrowth, monthReport, movePostIdea, portfolioLinks, postsInMonth, saveInstagramStat, savePostIdea } from '../src/domain/marketing.ts';
import { addPipelineStage, createClient, createOpportunity, createProject, setProjectStatus, type ActionContext } from '../src/domain/operations.ts';
import { normalizeData } from '../src/domain/people.ts';
import type { AppData, Client, Opportunity } from '../src/domain/types.ts';
import {
  addWeekGoal,
  formatMinutes,
  logTime,
  markChatRead,
  parseDuration,
  saveNote,
  saveSplit,
  sendChatMessage,
  splitAmounts,
  startTimer,
  stopTimer,
  toggleTraining,
  trainingStatus,
  unreadChat,
  valuePerHour,
  visibleNotes,
  weekGoals,
} from '../src/domain/workspace.ts';

const NOW = new Date(2026, 10, 24, 10, 0); // 24/11/2026
const TODAY = todayISO(NOW);
const maria: ActionContext = { userId: 'maria', now: NOW };
const wesley: ActionContext = { userId: 'wesley', now: NOW };

let data: AppData;
beforeEach(() => {
  data = createEmptyData(NOW);
});

function lead(stage: string, extra: Partial<Opportunity> = {}): Opportunity {
  const o = createOpportunity(data, { contactName: 'Ana Souza', company: `Lead ${data.opportunities.length + 1}`, segment: 'Barbearia', source: 'Google Maps', contact: { phone: '(47) 99999-0000' }, stage, estimatedValue: 600, nextAction: '', followUpDate: null, ownerIds: ['maria'], notes: '' }, maria);
  return Object.assign(o, extra);
}

function client(name = 'Barbearia Exemplo'): Client {
  return createClient(data, { company: name, contactName: 'João Lima', segment: 'Barbearia', contact: { phone: '' }, city: 'Brusque', contractStatus: 'em_andamento', nextStep: '', notes: '' }, maria);
}

describe('cadência de prospecção', () => {
  it('etapas antigas vão para a etapa mais parecida, sem perder nenhum lead', () => {
    assert.equal(cadenceTargetFor('Follow Up'), 'aguardando');
    assert.equal(cadenceTargetFor('Follow Up 2'), 'aguardando');
    assert.equal(cadenceTargetFor('Reuniao'), 'negociacao');
    assert.equal(cadenceTargetFor('Interessado para o futuro'), 'sem_resposta');
    assert.equal(cadenceTargetFor('Preparar a mensagem'), 'abordar');
    assert.equal(cadenceTargetFor('Já está fazendo site'), null);

    // Funil parecido com o de vocês hoje.
    data.pipelineStages = data.pipelineStages.filter((s) => s.id === 'ganho' || s.id === 'perdido');
    data.pipelineStages[0].label = 'Ganho';
    const ids: Record<string, string> = {};
    for (const label of ['Follow Up', 'Follow Up 2', 'Reuniao', 'Interessado para o futuro', 'Já está fazendo site']) ids[label] = addPipelineStage(data, label).id;
    const a = lead(ids['Follow Up 2'], { followUpDate: '2026-11-01' });
    const b = lead(ids['Já está fazendo site']);
    const total = data.opportunities.length;
    migrateToCadence(data);
    assert.deepEqual(data.pipelineStages.slice(0, 5).map((s) => s.id), ['aquecimento', 'abordar', 'aguardando', 'negociacao', 'sem_resposta']);
    assert.equal(data.pipelineStages.at(-2)?.label, 'Fechou');
    assert.equal(data.opportunities.length, total);
    assert.equal(a.stage, 'aguardando');
    assert.equal(a.followUpDate, null, 'a cadência calcula o follow-up sozinha');
    assert.equal(b.stage, ids['Já está fazendo site'], 'etapa sem par continua no funil');
    assert.ok(data.pipelineStages.some((s) => s.id === ids['Já está fazendo site']));
    // Rodar de novo não muda nada.
    const snapshot = JSON.stringify(data);
    migrateToCadence(data);
    assert.equal(JSON.stringify(data), snapshot);
  });

  it('a migração roda uma vez só nos dados salvos e é igual para os dois sócios', () => {
    const old = createEmptyData(NOW);
    old.pipelineStages = old.pipelineStages.filter((s) => s.id === 'ganho' || s.id === 'perdido');
    addPipelineStage(old, 'Follow Up');
    old.meta.migrations = [];
    const a = normalizeData(structuredClone(old));
    const b = normalizeData(structuredClone(old));
    assert.deepEqual(a, b);
    assert.ok(a.meta.migrations?.includes('2026-11-cadencia'));
  });

  it('follow-ups em 3, 7 e 15 dias depois da primeira mensagem', () => {
    const o = lead('abordar');
    assert.equal(callToday(data, TODAY)[0].group, 'primeira');
    markSent(data, o.id, addDays(TODAY, -3), maria);
    assert.equal(o.stage, 'aguardando');
    assert.equal(followStatus(data, o, TODAY).state, 'follow_up', 'dia 3: hora do 1º follow-up');
    markSent(data, o.id, TODAY, maria);
    assert.equal(followStatus(data, o, TODAY).state, 'aguardando');
    assert.equal(followStatus(data, o, addDays(TODAY, 4)).state, 'follow_up', 'dia 7');
    logContact(data, o.id, { date: addDays(TODAY, 4), channel: 'whatsapp', direction: 'enviado', note: '' }, maria);
    assert.equal(followStatus(data, o, addDays(TODAY, 11)).needsAction, false);
    assert.equal(followStatus(data, o, addDays(TODAY, 12)).state, 'follow_up', 'dia 15');
    logContact(data, o.id, { date: addDays(TODAY, 12), channel: 'whatsapp', direction: 'enviado', note: '' }, maria);
    assert.equal(followStatus(data, o, addDays(TODAY, 12)).state, 'sem_resposta', 'acabou a cadência: decidir');
    markNoReply(data, o.id, addDays(TODAY, 12), maria);
    assert.equal(o.stage, 'sem_resposta');
    assert.equal(o.followUpDate, addDays(TODAY, 102));
    // 3 meses depois: tentar de novo, a contagem recomeça.
    assert.equal(callToday(data, addDays(TODAY, 102))[0].group, 'tentar');
    retryLead(data, o.id, addDays(TODAY, 102), maria);
    markSent(data, o.id, addDays(TODAY, 102), maria);
    assert.equal(followStatus(data, o, addDays(TODAY, 104)).state, 'aguardando');
  });

  it('respondeu vai para negociação; aquecimento dura 3 dias', () => {
    const o = lead('abordar');
    markSent(data, o.id, TODAY, maria);
    markReplied(data, o.id, TODAY, maria);
    assert.equal(o.stage, 'negociacao');
    const w = lead('abordar');
    startWarmup(data, w.id, TODAY, maria);
    assert.equal(callToday(data, TODAY).find((i) => i.opp.id === w.id)?.what, 'Dia 1 de 3 · aquecer: seguir e curtir 2 posts');
    assert.equal(callToday(data, addDays(TODAY, 2)).find((i) => i.opp.id === w.id)?.group, 'primeira');
    const fresh = lead('aquecimento');
    assert.equal(fresh.followUpDate, addDays(TODAY, 2), 'lead novo em aquecimento já ganha a data');
  });

  it('a primeira mensagem aparece no Pra fazer hoje como uma linha só', () => {
    lead('abordar');
    lead('abordar');
    const focus = todayFocus(data, TODAY, { finance: false }).filter((i) => i.key === 'o:primeira');
    assert.equal(focus.length, 1);
    assert.match(focus[0].title, /2 leads/);
  });
});

describe('rotina, notas e chat', () => {
  it('prioridades extras além das 3', () => {
    addPrioritySlot(data, TODAY, maria);
    assert.equal(prioritiesOf(data, TODAY, 'maria').length, 4);
    setPriority(data, TODAY, 3, 'Responder a Leci', maria);
    assert.throws(() => removePrioritySlot(data, TODAY, 1, maria), /extras/);
    removePrioritySlot(data, TODAY, 3, maria);
    assert.equal(prioritiesOf(data, TODAY, 'maria').length, 3);
  });

  it('nota particular só aparece para quem escreveu', () => {
    saveNote(data, null, { title: '', text: 'Ideia para os dois', color: 'rosa', private: false }, maria);
    const mine = saveNote(data, null, { title: 'Só minha', text: 'x', color: 'creme', private: true }, maria);
    assert.equal(visibleNotes(data, 'maria').length, 2);
    assert.equal(visibleNotes(data, 'wesley').length, 1);
    assert.throws(() => saveNote(data, mine.id, { title: 'Mexi', text: 'x', color: 'creme', private: true }, wesley), /não encontrada/);
    assert.throws(() => saveNote(data, null, { title: ' ', text: ' ', color: 'creme', private: false }, maria), /Escreva/);
  });

  it('mensagens não lidas e leitura', () => {
    sendChatMessage(data, 'Mandei a prévia', { type: 'client', id: 'x' }, wesley);
    sendChatMessage(data, 'Ela pediu outra foto', null, wesley);
    assert.equal(unreadChat(data, 'maria'), 2);
    assert.equal(unreadChat(data, 'wesley'), 0);
    markChatRead(data, maria);
    assert.equal(unreadChat(data, 'maria'), 0);
    assert.throws(() => sendChatMessage(data, '   ', null, maria), /Escreva/);
  });
});

describe('planejamento e treinamento', () => {
  it('metas da semana ficam na semana certa', () => {
    addWeekGoal(data, TODAY, 'Fechar 2 clientes', 'maria');
    addWeekGoal(data, addDays(TODAY, 7), 'Semana que vem', null);
    assert.equal(weekGoals(data, startOfWeek(TODAY)).length, 1);
  });

  it('cada pessoa marca o próprio treinamento', () => {
    const proc = data.processes![0];
    toggleTraining(data, proc.id, 'soloAt', wesley);
    const s = trainingStatus(data, 'wesley');
    assert.equal(s.solo, 1);
    assert.equal(s.read, 1, 'quem fez sozinho também leu');
    assert.equal(trainingStatus(data, 'maria').read, 0);
  });
});

describe('clientes: onboarding, briefing, arquivos, acessos, origem', () => {
  it('onboarding e briefing', () => {
    const c = client();
    assert.equal(inOnboarding(data, c), true);
    toggleOnboarding(data, c.id, 'contrato', TODAY);
    assert.equal(onboardingProgress(c).done, 1);
    saveBriefing(data, c.id, { bq_negocio: 'Barbearia', bq_publico: 'Homens', bq_objetivo: 'Agendamentos', bq_secoes: 'Serviços', bq_cores: 'Preto' }, maria);
    assert.ok(c.onboarding?.briefing, 'briefing com metade das respostas marca o passo');
    const p = createProject(data, { name: 'Site', clientId: c.id, ownerIds: ['maria'], status: 'em_andamento', startDate: TODAY, dueDate: addDays(TODAY, 10), description: '' }, maria);
    setProjectStatus(data, p.id, 'publicado', TODAY);
    assert.equal(inOnboarding(data, c), false, 'cliente entregue sai do onboarding');
  });

  it('arquivos e acessos sem senha', () => {
    const c = client();
    const f = addClientFile(data, c.id, { name: 'logo.png', type: 'image/png', size: 10, path: 'clientes/2026-11/a.png', category: 'Logo e identidade' }, maria);
    assert.equal(removeClientFile(data, c.id, f.id)?.path, 'clientes/2026-11/a.png');
    assert.throws(() => saveAccess(data, c.id, null, { service: 'Instagram', login: 'barbearia', whereSaved: 'senha: 123', whoHasAccess: '', url: '', notes: '' }), /senhas/);
    saveAccess(data, c.id, null, { service: 'Instagram', login: 'barbearia', whereSaved: 'Bitwarden', whoHasAccess: 'Cliente e Maria', url: '', notes: '' });
    assert.equal(c.accesses?.length, 1);
  });

  it('A a Z, origem e indicações', () => {
    const z = client('Zé Lanches');
    const a = client('Ateliê Flor');
    client('ateliê bela');
    client('99 Pizzas');
    const groups = clientsAZ(data);
    assert.deepEqual(groups.map((g) => g.letter), ['A', 'Z', '#']);
    assert.equal(groups[0].clients.length, 2);
    assert.equal(indexLetter('Ótica Sol'), 'O');
    saveClientOrigin(data, z.id, { source: '', referredBy: a.id, referredByName: '' });
    assert.equal(clientSource(data, z), 'Indicação');
    assert.equal(referrals(data)[0].who, 'Ateliê Flor');
    assert.throws(() => saveClientOrigin(data, a.id, { source: '', referredBy: a.id, referredByName: '' }), /si mesmo/);
  });
});

describe('contratos e vencimentos', () => {
  it('avisa 30 dias antes e renova pelo mesmo período', () => {
    const c = client();
    const k = saveContract(data, null, { clientId: c.id, title: '', kind: 'manutencao', startDate: addDays(TODAY, -340), endDate: addDays(TODAY, 20), amount: 49.99, recurrence: 'mensal', signed: true, link: '', notes: '' }, maria);
    assert.equal(k.title, 'Manutenção mensal');
    assert.equal(contractState(k, TODAY), 'vencendo');
    assert.equal(contractsEndingSoon(data, TODAY).length, 1);
    assert.ok(todayFocus(data, TODAY, { finance: false }).some((i) => i.kind === 'contract'));
    renewContract(data, k.id);
    assert.equal(k.startDate, addDays(TODAY, 21));
    assert.equal(contractState(k, TODAY), 'ativo');
    assert.throws(() => saveContract(data, null, { clientId: c.id, title: 'X', kind: 'site', startDate: TODAY, endDate: addDays(TODAY, -1), amount: null, recurrence: 'unico', signed: false, link: '', notes: '' }, maria), /antes do início/);
  });
});

describe('marketing e relatório', () => {
  it('seguidores mês a mês, ano a ano', () => {
    saveInstagramStat(data, { month: '2025-11', followers: 120, reach: null, messages: null });
    saveInstagramStat(data, { month: '2026-10', followers: 300, reach: 900, messages: 4 });
    saveInstagramStat(data, { month: '2026-11', followers: 340, reach: null, messages: null });
    saveInstagramStat(data, { month: '2026-11', followers: 350, reach: null, messages: null });
    const g = instagramGrowth(data);
    assert.equal(g.last?.followers, 350, 'anotar de novo no mesmo mês substitui');
    assert.equal(g.monthChange, 50);
    assert.equal(g.yearChange, 230);
    assert.deepEqual(followersByYear(data), [{ year: '2025', followers: 120 }, { year: '2026', followers: 350 }]);
    assert.throws(() => saveInstagramStat(data, { month: '2026-12', followers: -1, reach: null, messages: null }));
  });

  it('posts postados contam no mês e o relatório junta tudo', () => {
    const idea = savePostIdea(data, null, { title: 'Antes e depois', format: 'Reels', notes: '', date: null }, maria);
    movePostIdea(data, idea.id, 'postado', TODAY);
    assert.equal(postsInMonth(data, '2026-11'), 1);
    const o = lead('abordar');
    markSent(data, o.id, TODAY, maria);
    const r = monthReport(data, '2026-11');
    assert.equal(r.posts, 1);
    assert.equal(r.contacted, 1);
    assert.equal(r.bySource[0].source, 'Google Maps');
  });

  it('portfólio junta links guardados e sites publicados', () => {
    const demo = createDemoData(NOW);
    const p = demo.projects[0];
    p.links.production = 'https://exemplo-fictício.com.br';
    p.status = 'publicado';
    assert.ok(portfolioLinks(demo).some((l) => l.url === p.links.production));
  });
});

describe('horas, divisão e orçamento', () => {
  it('cronômetro e valor por hora', () => {
    const c = client();
    const p = createProject(data, { name: 'Site', clientId: c.id, ownerIds: ['maria'], status: 'em_andamento', startDate: TODAY, dueDate: addDays(TODAY, 10), description: '' }, maria);
    p.extra.amount = 600;
    startTimer(data, p.id, maria);
    assert.throws(() => startTimer(data, p.id, maria), /já tem/);
    const later: ActionContext = { userId: 'maria', now: new Date(NOW.getTime() + 90 * 60_000) };
    const log = stopTimer(data, later)!;
    assert.equal(log.minutes, 90);
    logTime(data, p.id, { date: TODAY, minutes: parseDuration('1h30'), note: '' }, maria);
    assert.equal(valuePerHour(data, p), 200);
    assert.equal(parseDuration('1,5'), 90);
    assert.equal(parseDuration('45 min'), 45);
    assert.equal(parseDuration('2:15'), 135);
    assert.equal(formatMinutes(135), '2h15');
    assert.throws(() => parseDuration('muito'), /1h30/);
  });

  it('divisão precisa somar 100%', () => {
    assert.throws(() => saveSplit(data, { agency: 50, taxes: 0, partners: { maria: 30, wesley: 30 } }), /100%/);
    saveSplit(data, { agency: 30, taxes: 6, partners: { maria: 32, wesley: 32 } });
    assert.deepEqual(splitAmounts(data.moneySplit!, 1000), { agency: 300, taxes: 60, partners: { maria: 320, wesley: 320 } });
  });

  it('orçamento rápido soma, aplica desconto e monta a mensagem', () => {
    const demo = createDemoData(NOW);
    const ids = demo.services.filter((s) => s.active).slice(0, 2).map((s) => s.id);
    const q = quickQuote(demo, ids, 10, TODAY);
    assert.equal(q.services.length, 2);
    assert.equal(q.total, q.oneTime - q.discount);
    assert.match(quoteMessage(demo, q, 'João Lima', TODAY), /^Oi, João!/);
  });
});

describe('cópia dos dados', () => {
  it('planilha válida, sem valores para quem não vê o financeiro', () => {
    const demo = createDemoData(NOW);
    const withFinance = backupSheets(demo, true).map((s) => s.name);
    const without = backupSheets(demo, false).map((s) => s.name);
    assert.ok(withFinance.includes('Financeiro'));
    assert.ok(!without.includes('Financeiro'));
    const bytes = buildXlsx(backupSheets(demo, true));
    assert.equal(bytes[0], 0x50);
    assert.equal(bytes[1], 0x4b, 'começa como ZIP');
    assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  });
});
