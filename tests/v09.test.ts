/** v0.9: mensagens com opções, rotina da prospecção, entrega e pagamento, avisos, banco de conteúdo e aprendizados. */
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { addDays, todayISO } from '../src/core/dates.ts';
import { COURSE_NOTES } from '../src/data/course-notes.ts';
import { createDemoData, createEmptyData } from '../src/data/seed.ts';
import { saveApproval } from '../src/domain/approvals.ts';
import { markSent } from '../src/domain/cadence.ts';
import { deleteContentItem, contentList, markContentUsed, saveContentItem } from '../src/domain/contentbank.ts';
import { changeArtsUsed, clientBalance, deliveryAlerts, finalPaymentPending, limitUsage, limitsText, markPreviewSent, previewWaiting, projectLimits, setProjectLimits } from '../src/domain/delivery.ts';
import { proposalDocument, contractDocument, documentText } from '../src/domain/documents.ts';
import { notificationsFor, todayFocus } from '../src/domain/insights.ts';
import { importLearnings, learningList, learningOfTheDay, saveLearning, toggleApplied } from '../src/domain/learnings.ts';
import { STARTER_MESSAGES, fillMessage, guessGroup, guessStep, messageForStep, messageOptions, organizeMessages, stepForLead, stepLabel } from '../src/domain/messages.ts';
import { createClient, createOpportunity, createProject, saveLibraryItem, type ActionContext } from '../src/domain/operations.ts';
import { normalizeData } from '../src/domain/people.ts';
import { routineDone, saveRoutine, toggleRoutineTask } from '../src/domain/routine.ts';
import type { AppData, Client, Project, StoredFile } from '../src/domain/types.ts';

const NOW = new Date(2026, 10, 25, 10, 0); // 25/11/2026
const TODAY = todayISO(NOW);
const maria: ActionContext = { userId: 'maria', now: NOW };

let data: AppData;
beforeEach(() => {
  data = createEmptyData(NOW);
});

function client(extra: Partial<Client> = {}): Client {
  const c = createClient(data, { company: 'Salgados da Leia', contactName: 'Leia Souza', segment: 'Salgados', contact: { phone: '(47) 99999-1111' }, city: 'Brusque', contractStatus: 'em_andamento', nextStep: '', notes: '' }, maria);
  return Object.assign(c, extra);
}

function site(c: Client, extra: Partial<Project> = {}): Project {
  const p = createProject(data, { name: 'Site', clientId: c.id, ownerIds: ['maria'], status: 'em_andamento', startDate: TODAY, dueDate: addDays(TODAY, 10), description: '', type: 'site' }, maria);
  return Object.assign(p, extra);
}

function approval(projectId: string, kind: 'previa' | 'alteracao', date: string) {
  saveApproval(data, null, { kind, clientId: null, projectId, proposalId: null, date, channel: 'WhatsApp', summary: '', quote: '', link: '' }, maria);
}

describe('mensagens com opções', () => {
  it('base nova já vem com as mensagens de cada momento, com grupo e opções', () => {
    for (const step of ['abordagem', 'followup_1', 'followup_2', 'followup_3', 'encerramento', 'previa_sumiu', 'pagamento_final', 'extra', 'depoimento'] as const) {
      const item = messageForStep(data, step);
      assert.ok(item, `falta a mensagem de ${step}`);
      assert.ok(item.group);
    }
    assert.equal(messageOptions(messageForStep(data, 'previa_sumiu')!).length, 2);
  });

  it('organiza mensagens antigas sem mudar o texto e sem duplicar momentos', () => {
    const d = createEmptyData(NOW);
    d.library = [
      { id: 'a', category: 'mensagem', title: 'Follow up 1', summary: '', content: 'Oi!', authorId: 'maria', updatedAt: '2026-11-01T10:00:00.000Z' },
      { id: 'b', category: 'mensagem', title: 'Quando acha caro', summary: '', content: 'Entendo...', authorId: 'maria', updatedAt: '2026-11-01T10:00:00.000Z' },
      { id: 'c', category: 'mensagem', title: 'Tabela de preços', summary: '', content: 'R$', authorId: 'maria', updatedAt: '2026-11-01T10:00:00.000Z' },
    ];
    organizeMessages(d);
    const a = d.library.find((l) => l.id === 'a')!;
    assert.equal(a.step, 'followup_1');
    assert.equal(a.group, 'followup');
    assert.equal(a.content, 'Oi!');
    assert.equal(d.library.find((l) => l.id === 'b')!.group, 'objecoes');
    assert.equal(d.library.find((l) => l.id === 'c')!.group, 'precificacao');
    // Já tinha 1º follow-up: o modelo novo desse momento não entra.
    assert.ok(!d.library.some((l) => l.id === 'lib_followup_1'));
    assert.ok(d.library.some((l) => l.id === 'lib_followup_2'));
    const count = d.library.length;
    organizeMessages(d);
    assert.equal(d.library.length, count);
  });

  it('o ajuste roda uma vez só nos dados salvos (os dois sócios chegam ao mesmo resultado)', () => {
    const once = normalizeData(structuredClone(createDemoData(NOW)));
    const twice = normalizeData(structuredClone(once));
    assert.deepEqual(twice.library, once.library);
    assert.equal(once.library.filter((l) => l.step === 'abordagem').length, 1);
  });

  it('adivinha grupo e momento pelo título', () => {
    assert.equal(guessGroup({ title: 'Cliente achou caro', summary: '' }), 'objecoes');
    assert.equal(guessGroup({ title: 'Lembrete de retorno', summary: '' }), 'followup');
    assert.equal(guessGroup({ title: 'Boas-vindas ao cliente', summary: '' }), 'situacao');
    assert.equal(guessStep({ title: '2º follow-up' }), 'followup_2');
    assert.equal(guessStep({ title: 'Primeira mensagem' }), 'abordagem');
    assert.equal(guessStep({ title: 'Pós-venda: 7 dias' }), null);
  });

  it('salva até 3 opções e preenche os campos com o cadastro', () => {
    const item = saveLibraryItem(data, null, { category: 'mensagem', title: 'Teste', summary: '', content: 'Oi {{nome}} da {{empresa}}', options: ['Opção 2 para {{nome}}', ''], group: 'situacao', step: null }, maria);
    assert.deepEqual(messageOptions(item), ['Oi {{nome}} da {{empresa}}', 'Opção 2 para {{nome}}']);
    assert.equal(fillMessage(item.content, { company: 'Leia Salgados', contact: 'Leia Souza', me: 'Maria' }), 'Oi Leia da Leia Salgados');
    assert.equal(fillMessage('Faltam {{valor}}', { company: 'X', contact: 'Y', me: 'Z' }), 'Faltam {{valor}}');
    assert.equal(fillMessage('Faltam {{valor}}', { company: 'X', contact: 'Y', me: 'Z', amount: 'R$ 295,00' }), 'Faltam R$ 295,00');
  });

  it('escolhe a mensagem do dia pela tentativa', () => {
    assert.equal(stepForLead({ stage: 'abordar', attempts: 0 }), 'abordagem');
    assert.equal(stepForLead({ stage: 'aguardando', attempts: 1 }), 'followup_1');
    assert.equal(stepForLead({ stage: 'aguardando', attempts: 3 }), 'followup_3');
    assert.equal(stepForLead({ stage: 'aguardando', attempts: 4 }), 'encerramento');
    assert.equal(stepForLead({ stage: 'sem_resposta', attempts: 4 }), 'tentar');
    assert.equal(stepLabel('followup_2', [3, 7, 15]), '2º follow-up · dia 7');
  });

  it('depois da primeira mensagem, o lead pede o 1º follow-up', () => {
    const o = createOpportunity(data, { contactName: 'Ana', company: 'Barbearia', segment: '', source: 'Google Maps', contact: {}, stage: 'abordar', estimatedValue: null, nextAction: '', followUpDate: null, ownerIds: ['maria'], notes: '' }, maria);
    markSent(data, o.id, TODAY, maria);
    assert.equal(stepForLead({ stage: o.stage, attempts: o.contactLog!.length }), 'followup_1');
  });
});

describe('rotina da prospecção', () => {
  it('marca por dia e zera no dia seguinte', () => {
    toggleRoutineTask(data, 'rot_leads', TODAY);
    assert.deepEqual(routineDone(data, TODAY), ['rot_leads']);
    assert.deepEqual(routineDone(data, addDays(TODAY, 1)), []);
    toggleRoutineTask(data, 'rot_leads', TODAY);
    assert.deepEqual(routineDone(data, TODAY), []);
  });

  it('editar mantém o que já foi marcado nas tarefas que continuam', () => {
    toggleRoutineTask(data, 'rot_leads', TODAY);
    saveRoutine(data, 'Cadastrar 5 leads novos (Google Maps)\nNova tarefa', 'Sem site');
    assert.equal(data.prospectRoutine!.tasks.length, 2);
    assert.deepEqual(routineDone(data, TODAY), ['rot_leads']);
    assert.deepEqual(data.prospectRoutine!.criteria, ['Sem site']);
  });

  it('esquece dias com mais de 30 dias', () => {
    toggleRoutineTask(data, 'rot_leads', addDays(TODAY, -40));
    toggleRoutineTask(data, 'rot_story', TODAY);
    assert.deepEqual(Object.keys(data.prospectRoutine!.done), [TODAY]);
  });
});

describe('entrega e pagamento', () => {
  it('limites vêm do serviço, com padrão de 2 rodadas', () => {
    const c = client();
    const p = site(c);
    assert.deepEqual(projectLimits(data, p), { arts: null, revisions: 2, extraArtPrice: null, extraRevisionPrice: null });
    data.services[0].includedArts = 4;
    data.services[0].extraArtPrice = 30;
    p.serviceId = data.services[0].id;
    assert.equal(projectLimits(data, p).arts, 4);
    changeArtsUsed(data, p.id, 4);
    assert.equal(limitUsage(data, p).arts.atLimit, true);
    assert.equal(limitUsage(data, p).arts.over, false);
    changeArtsUsed(data, p.id, 1);
    assert.equal(limitUsage(data, p).arts.over, true);
    changeArtsUsed(data, p.id, -10);
    assert.equal(p.artsUsed, 0);
    setProjectLimits(data, p.id, { arts: 8, revisions: 3, extraArtPrice: null, extraRevisionPrice: 50 });
    assert.equal(projectLimits(data, p).revisions, 3);
    assert.throws(() => setProjectLimits(data, p.id, { arts: 1.5, revisions: 2, extraArtPrice: null, extraRevisionPrice: null }));
    assert.deepEqual(limitsText({ arts: 1, revisions: 2, extraArtPrice: 30, extraRevisionPrice: null }).map((l) => l.replace(/\s/g, ' ')), ['1 arte incluída', '2 rodadas de ajustes incluídas', 'Arte extra: R$ 30 cada']);
  });

  it('conta os dias sem resposta da prévia e para quando o cliente responde', () => {
    const p = site(client());
    markPreviewSent(data, p.id, addDays(TODAY, -4));
    assert.equal(p.status, 'aguardando_cliente');
    const wait = previewWaiting(data, p, TODAY)!;
    assert.equal(wait.days, 4);
    assert.equal(wait.alert, true);
    assert.equal(deliveryAlerts(data, TODAY)[0].kind, 'preview');
    // Uma resposta antiga (antes do envio) não conta.
    approval(p.id, 'alteracao', addDays(TODAY, -10));
    assert.ok(previewWaiting(data, p, TODAY));
    approval(p.id, 'alteracao', addDays(TODAY, -1));
    assert.equal(previewWaiting(data, p, TODAY), null);
  });

  it('prévia aprovada com parcela em aberto vira cobrança do pagamento final', () => {
    const c = client({ installments: [
      { id: 'i1', description: 'Entrada 50%', amount: 295, dueDate: TODAY, paidAt: TODAY, method: 'Pix' },
      { id: 'i2', description: 'Final 50%', amount: 295, dueDate: addDays(TODAY, 5), paidAt: null, method: 'Pix' },
    ] });
    const p = site(c);
    assert.equal(finalPaymentPending(data, p), false);
    approval(p.id, 'previa', TODAY);
    assert.equal(finalPaymentPending(data, p), true);
    assert.deepEqual({ total: clientBalance(c).total, open: clientBalance(c).open }, { total: 590, open: 295 });
    const focus = todayFocus(data, TODAY, { finance: true });
    assert.ok(focus.some((i) => i.kind === 'payment'));
    assert.ok(!todayFocus(data, TODAY, { finance: false }).some((i) => i.kind === 'payment'));
    c.installments[1].paidAt = TODAY;
    assert.equal(finalPaymentPending(data, p), false);
  });
});

describe('avisos (sininho)', () => {
  it('cada pessoa vê o que é dela e o que é da agência toda', () => {
    const p = site(client());
    p.ownerIds = ['wesley'];
    markPreviewSent(data, p.id, addDays(TODAY, -5));
    data.tasks.push({ id: 't1', title: 'Tarefa da Maria', description: '', assigneeIds: ['maria'], priority: 'media', status: 'a_fazer', dueDate: TODAY, related: null, createdBy: 'maria', createdAt: NOW.toISOString(), completedAt: null });
    data.tasks.push({ id: 't2', title: 'Tarefa futura', description: '', assigneeIds: ['maria'], priority: 'media', status: 'a_fazer', dueDate: addDays(TODAY, 2), related: null, createdBy: 'maria', createdAt: NOW.toISOString(), completedAt: null });
    const mine = notificationsFor(data, TODAY, 'maria', { finance: true }).map((i) => i.key);
    const his = notificationsFor(data, TODAY, 'wesley', { finance: true }).map((i) => i.key);
    assert.ok(mine.includes('t:t1'));
    assert.ok(!mine.includes('t:t2'));
    assert.ok(!mine.includes(`v:${p.id}`));
    assert.ok(his.includes(`v:${p.id}`));
  });
});

describe('proposta e contrato com os limites', () => {
  it('escreve as rodadas e os extras do serviço', () => {
    const c = client();
    const svc = data.services[0];
    Object.assign(svc, { includedArts: 4, includedRevisions: 3, extraArtPrice: 30, extraRevisionPrice: 50 });
    const proposal = { id: 'pr', title: 'Site', clientId: c.id, opportunityId: null, items: [{ id: 'it', serviceId: svc.id, name: svc.name, category: svc.category, price: 590, billing: 'unico' as const, quantity: 1 }], status: 'enviada' as const, sentAt: TODAY, decidedAt: null, validUntil: null, notes: '', contractLink: '', startDate: null, paymentTerms: '', contract: null, projectIds: [], createdBy: 'maria', createdAt: NOW.toISOString() };
    const text = documentText(proposalDocument(data, proposal, TODAY));
    assert.match(text, /4 artes incluídas/);
    assert.match(text, /Arte extra: R\$\s?30/);
    assert.match(text, /Até 3 rodadas de alterações/);
    assert.match(documentText(contractDocument(data, proposal, TODAY)), /até 3 rodadas de alterações.*cada rodada extra custa R\$\s?50/);
  });
});

describe('banco de conteúdo', () => {
  const file: StoredFile = { id: 'img1', name: 'arte.jpg', type: 'image/jpeg', size: 1000, path: '', dataUrl: 'data:image/jpeg;base64,AA==', category: 'Conteúdo', uploadedAt: NOW.toISOString(), authorId: 'maria' };

  it('texto precisa de texto e arte precisa de imagem', () => {
    assert.throws(() => saveContentItem(data, null, { kind: 'story', theme: '', title: 'Bom dia', text: '' }, maria));
    assert.throws(() => saveContentItem(data, null, { kind: 'arte', theme: '', title: 'Arte', text: '' }, maria));
    const story = saveContentItem(data, null, { kind: 'story', theme: 'Bastidores', title: 'Bom dia', text: 'Começando o dia criando sites' }, maria);
    const art = saveContentItem(data, null, { kind: 'arte', theme: 'Portfólio', title: 'Antes e depois', text: '', file }, maria);
    assert.equal(contentList(data, { kind: 'arte' }).length, 1);
    assert.equal(contentList(data, { query: 'criando' })[0].id, story.id);
    markContentUsed(data, story.id, TODAY);
    // O que já foi postado vai para o fim.
    assert.equal(contentList(data, {})[0].id, art.id);
    assert.equal(deleteContentItem(data, art.id)?.id, 'img1');
    assert.equal(data.contentBank!.length, 1);
  });
});

describe('aprendizados', () => {
  it('importa as anotações do curso uma vez só, na ordem do caderno', () => {
    assert.equal(importLearnings(data, COURSE_NOTES, maria), COURSE_NOTES.length);
    assert.equal(importLearnings(data, COURSE_NOTES, maria), 0);
    const list = learningList(data, { theme: 'Design e cores' });
    assert.equal(list[0].title, 'Os 7 princípios do design');
    assert.ok(learningList(data, { query: 'zapsign' }).length >= 1);
  });

  it('aprendizado do dia prefere o que falta praticar e é o mesmo o dia todo', () => {
    assert.equal(learningOfTheDay(data, TODAY), null);
    const a = saveLearning(data, null, { theme: 'Prospecção', title: 'A', text: 'texto', howToApply: '', source: '' }, maria);
    const b = saveLearning(data, null, { theme: 'Prospecção', title: 'B', text: 'texto', howToApply: '', source: '' }, maria);
    toggleApplied(data, a.id, TODAY);
    assert.equal(learningOfTheDay(data, TODAY)?.id, b.id);
    assert.equal(learningOfTheDay(data, addDays(TODAY, 1))?.id, b.id);
    assert.equal(learningList(data, { pending: true }).length, 1);
    assert.throws(() => saveLearning(data, null, { theme: '', title: '', text: 'x', howToApply: '', source: '' }, maria));
  });

  it('as anotações do curso têm ids únicos e textos preenchidos', () => {
    assert.equal(new Set(COURSE_NOTES.map((n) => n.id)).size, COURSE_NOTES.length);
    for (const n of COURSE_NOTES) assert.ok(n.title && n.text && n.theme);
  });
});

it('as mensagens iniciais têm ids e momentos únicos', () => {
  assert.equal(new Set(STARTER_MESSAGES.map((m) => m.id)).size, STARTER_MESSAGES.length);
  assert.equal(new Set(STARTER_MESSAGES.map((m) => m.step)).size, STARTER_MESSAGES.length);
});
