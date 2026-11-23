import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { addDays, todayISO } from '../src/core/dates.ts';
import { createDemoData, createEmptyData } from '../src/data/seed.ts';
import { afterSalesDue, afterSalesPoints, markAfterSales, nextAfterSales } from '../src/domain/aftersales.ts';
import { deleteApproval, revisionRounds, saveApproval, type ApprovalInput } from '../src/domain/approvals.ts';
import { saveContractInfo } from '../src/domain/business.ts';
import { agencyOf, prioritiesOf, saveAgency, setAlignment, setPriority, togglePriority, yesterdayPlan } from '../src/domain/daily.ts';
import { contractDocument, contractGaps, documentText, processManualDocument, proposalDocument, siteManualDocument } from '../src/domain/documents.ts';
import { todayFocus } from '../src/domain/insights.ts';
import { createClient, createProject, setProjectStatus, updateProject, type ActionContext } from '../src/domain/operations.ts';
import { currentStageOf, moveProcess, orderedProcesses, processForStage, saveProcess } from '../src/domain/processes.ts';
import { normalizeData } from '../src/domain/people.ts';
import type { AppData, Client, Project } from '../src/domain/types.ts';

const NOW = new Date(2026, 10, 23, 9, 0); // 23/11/2026
const TODAY = todayISO(NOW);
const ctx: ActionContext = { userId: 'maria', now: NOW };

let data: AppData;
beforeEach(() => {
  data = createEmptyData(NOW);
});

function newClient(name = 'Leci Teste'): Client {
  return createClient(data, { company: name, contactName: 'Leci Souza', segment: 'Alimentação', contact: { phone: '' }, city: 'Brusque', contractStatus: 'em_andamento', nextStep: '', notes: '' }, ctx);
}

function newSite(clientId: string): Project {
  return createProject(data, { name: 'Site one page', clientId, ownerIds: ['maria'], status: 'em_andamento', startDate: TODAY, dueDate: addDays(TODAY, 10), description: 'Início, cardápio e contato' }, ctx);
}

describe('processos (manual da agência)', () => {
  it('dados antigos ganham o manual inicial, sempre igual nos dois navegadores', () => {
    const old = createEmptyData(NOW) as Partial<AppData> & AppData;
    delete old.processes;
    delete old.approvals;
    delete old.daily;
    const a = normalizeData(structuredClone(old));
    const b = normalizeData(structuredClone(old));
    assert.deepEqual(a.processes, b.processes);
    assert.ok(a.processes!.length >= 10);
    assert.deepEqual(a.approvals, []);
    assert.deepEqual(normalizeData(structuredClone(a)), a, 'rodar de novo não muda nada');
  });

  it('ordena por área no caminho do cliente e liga as etapas de produção aos projetos', () => {
    const areas = [...new Set(orderedProcesses(data).map((p) => p.area))];
    assert.equal(areas[0], 'Prospecção');
    assert.ok(areas.indexOf('Produção') > areas.indexOf('Negociação'));
    const client = newClient();
    const project = newSite(client.id);
    const stage = currentStageOf(project)!;
    assert.equal(stage.name, project.stages[0].name);
    const guide = processForStage(data, stage.name.toUpperCase());
    assert.ok(guide, 'encontra o processo mesmo com maiúsculas');
    assert.ok(guide!.steps.some((s) => /Logo/.test(s)));
  });

  it('cria, edita e reordena etapas dentro da área', () => {
    const a = saveProcess(data, null, { area: 'Rotina da equipe', title: '  Reunião de segunda ', goal: '', owner: 'Maria', duration: '30 min', steps: ['Revisar a semana', ' ', 'Definir metas'], tips: '', stageName: '' }, ctx);
    assert.equal(a.title, 'Reunião de segunda');
    assert.deepEqual(a.steps, ['Revisar a semana', 'Definir metas']);
    assert.equal(a.stageName, null);
    const area = () => orderedProcesses(data).filter((p) => p.area === 'Rotina da equipe').map((p) => p.id);
    assert.equal(area().at(-1), a.id);
    moveProcess(data, a.id, -1);
    assert.equal(area().at(-2), a.id);
    assert.throws(() => saveProcess(data, null, { area: 'X', title: ' ', goal: '', owner: '', duration: '', steps: [], tips: '', stageName: null }, ctx));
  });
});

describe('aprovações', () => {
  it('registra com a prova e conta as rodadas de alteração do projeto', () => {
    const client = newClient();
    const project = newSite(client.id);
    const base: ApprovalInput = { kind: 'alteracao', clientId: null, projectId: project.id, proposalId: null, date: TODAY, channel: 'WhatsApp', summary: '', quote: 'Troca a foto do topo', link: '' };
    const a = saveApproval(data, null, { ...base, proof: { path: '2026-11/x.png', name: 'print.png', type: 'image/png', size: 1000 } }, ctx);
    assert.equal(a.clientId, client.id, 'o cliente vem do projeto');
    saveApproval(data, null, base, ctx);
    saveApproval(data, null, { ...base, kind: 'previa' }, ctx);
    assert.equal(revisionRounds(data, project.id), 2);
    assert.equal(deleteApproval(data, a.id)?.path, '2026-11/x.png', 'devolve a prova para apagar o arquivo');
    assert.equal(revisionRounds(data, project.id), 1);
  });

  it('não aceita registro sem cliente, projeto ou proposta, nem sem data', () => {
    const base: ApprovalInput = { kind: 'previa', clientId: null, projectId: null, proposalId: null, date: TODAY, channel: '', summary: '', quote: '', link: '' };
    assert.throws(() => saveApproval(data, null, base, ctx), /cliente/);
    const client = newClient();
    assert.throws(() => saveApproval(data, null, { ...base, clientId: client.id, date: '' }, ctx), /data/);
  });
});

describe('pós-venda', () => {
  it('começa quando o projeto é publicado e segue 7, 30 e 90 dias', () => {
    const client = newClient();
    const project = newSite(client.id);
    assert.equal(afterSalesPoints(data, client).length, 0);
    setProjectStatus(data, project.id, 'publicado', TODAY);
    assert.equal(project.publishedAt, TODAY);
    const points = afterSalesPoints(data, client);
    assert.deepEqual(points.slice(0, 3).map((p) => p.date), [addDays(TODAY, 7), addDays(TODAY, 30), addDays(TODAY, 90)]);
    assert.equal(nextAfterSales(data, client, TODAY)?.label, '7 dias');
    assert.equal(afterSalesDue(data, TODAY, TODAY).length, 0, 'ainda não venceu');
    const later = addDays(TODAY, 8);
    assert.equal(afterSalesDue(data, later, later)[0].point.label, '7 dias');
    markAfterSales(data, client.id, points[0].key, later, ctx);
    assert.equal(nextAfterSales(data, client, later)?.label, '30 dias');
  });

  it('pula marcos antigos que ninguém fez e aparece no Foco de hoje', () => {
    const client = newClient();
    const project = newSite(client.id);
    setProjectStatus(data, project.id, 'publicado', addDays(TODAY, -40));
    const next = nextAfterSales(data, client, TODAY);
    assert.equal(next?.label, '30 dias', 'o de 7 dias ficou para trás');
    const focus = todayFocus(data, TODAY, { finance: false }).filter((f) => f.kind === 'aftersales');
    assert.equal(focus.length, 1);
    assert.match(focus[0].title, /Leci Teste/);
    assert.equal(focus[0].overdue, false, 'relacionamento não conta como atraso');
  });

  it('publicar pelo formulário também guarda o dia', () => {
    const client = newClient();
    const project = newSite(client.id);
    updateProject(data, project.id, { status: 'publicado' });
    assert.ok(project.publishedAt);
  });

  it('dados de demonstração continuam consistentes', () => {
    const demo = createDemoData(NOW);
    for (const c of demo.clients) afterSalesPoints(demo, c);
    assert.ok(demo.library.some((l) => l.id === 'lib_posvenda_7'), 'mensagens de pós-venda na Biblioteca');
  });
});

describe('rotina do dia', () => {
  it('cada pessoa tem 3 prioridades e só marca o que foi escrito', () => {
    assert.equal(prioritiesOf(data, TODAY, 'maria').length, 3);
    assert.throws(() => togglePriority(data, TODAY, 0, ctx), /Escreva/);
    setPriority(data, TODAY, 0, '  Fechar a Leci ', ctx);
    togglePriority(data, TODAY, 0, ctx);
    assert.deepEqual(prioritiesOf(data, TODAY, 'maria')[0], { text: 'Fechar a Leci', done: true });
    assert.equal(prioritiesOf(data, TODAY, 'wesley')[0].text, '', 'as do Wesley ficam separadas');
  });

  it('o "amanhã" do alinhamento aparece no dia seguinte e dias antigos são apagados', () => {
    setAlignment(data, addDays(TODAY, -100), 'tomorrow', 'antigo');
    setAlignment(data, TODAY, 'tomorrow', 'Mandar a prévia');
    assert.equal(yesterdayPlan(data, addDays(TODAY, 1)), 'Mandar a prévia');
    assert.ok(!data.daily![addDays(TODAY, -100)], 'guarda só os últimos 60 dias');
  });
});

describe('documentos', () => {
  function proposal() {
    const demo = createDemoData(NOW);
    return { demo, p: demo.proposals[0] };
  }

  it('a proposta explica o domínio e mostra o total', () => {
    const { demo, p } = proposal();
    const doc = proposalDocument(demo, p, TODAY);
    const text = documentText(doc);
    assert.match(text, /PROPOSTA COMERCIAL/);
    assert.match(text, /Registro\.br/);
    assert.match(text, /Total|Mensalidade/);
    assert.ok(doc.fileName.startsWith('proposta-'));
  });

  it('o contrato avisa o que falta e usa os dados da agência', () => {
    const { demo, p } = proposal();
    assert.ok(contractGaps(demo, p).length >= 2);
    saveAgency(demo, { responsible: 'Maria Eduarda', document: '00.000.000/0001-00', city: 'Brusque, SC' });
    saveContractInfo(demo, p.id, { clientDocument: '111.222.333-44', clientAddress: 'Rua A, 1', scope: 'início e contato', deliveryDays: 7 });
    assert.deepEqual(contractGaps(demo, p), []);
    const text = documentText(contractDocument(demo, p, TODAY));
    assert.match(text, /Maria Eduarda/);
    assert.match(text, /111\.222\.333-44/);
    assert.match(text, /7 dias úteis/);
    assert.match(text, /comarca de Brusque, SC/);
    assert.throws(() => saveContractInfo(demo, p.id, { clientDocument: '', clientAddress: '', scope: '', deliveryDays: 0 }));
  });

  it('manual do site e manual de processos', () => {
    const client = newClient();
    const project = newSite(client.id);
    const site = documentText(siteManualDocument(data, project, TODAY));
    assert.match(site, /Como divulgar/i);
    const manual = processManualDocument(data, TODAY);
    assert.ok(manual.blocks.filter((b) => b.t === 'heading').length >= 5);
    assert.equal(agencyOf(data).name, 'Mawe Create');
  });
});
