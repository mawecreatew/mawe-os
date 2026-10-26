import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { addDays, todayISO } from '../src/core/dates.ts';
import { createDemoData, createEmptyData } from '../src/data/seed.ts';
import {
  addInstallment,
  addOpportunityNote,
  convertOpportunityToClient,
  createProject,
  createTask,
  cycleStageStatus,
  deleteOpportunity,
  moveOpportunity,
  toggleInstallmentPaid,
  toggleTaskDone,
  type ActionContext,
} from '../src/domain/operations.ts';
import { can } from '../src/domain/permissions.ts';
import { addPerson, normalizeData, peopleNames, removePerson } from '../src/domain/people.ts';
import {
  clientFinance,
  filterTasks,
  greeting,
  isOverdue,
  overdueTasks,
  pipelineSummary,
  projectProgress,
  todayPriorities,
  upcomingDeadlines,
} from '../src/domain/selectors.ts';
import type { AppData } from '../src/domain/types.ts';

const NOW = new Date(2026, 9, 26, 9, 0); // 26/10/2026, 9h
const TODAY = todayISO(NOW);
const ctx: ActionContext = { userId: 'maria', now: NOW };

let data: AppData;
beforeEach(() => {
  data = createDemoData(NOW);
});

describe('dados de demonstração', () => {
  it('todas as referências apontam para registros existentes', () => {
    const ids = {
      user: new Set(data.users.map((u) => u.id)),
      client: new Set(data.clients.map((c) => c.id)),
      project: new Set(data.projects.map((p) => p.id)),
      opportunity: new Set(data.opportunities.map((o) => o.id)),
    };
    for (const t of data.tasks) {
      assert.ok(t.assigneeIds.length > 0 && t.assigneeIds.every((id) => ids.user.has(id)), `responsável inválido em ${t.id}`);
      if (t.related) assert.ok(ids[t.related.type].has(t.related.id), `vínculo inválido em ${t.id}`);
    }
    for (const p of data.projects) {
      assert.ok(ids.client.has(p.clientId));
      assert.ok(p.ownerIds.length > 0 && p.ownerIds.every((id) => ids.user.has(id)));
    }
    for (const o of data.opportunities) if (o.clientId) assert.ok(ids.client.has(o.clientId));
    for (const d of data.decisions) if (d.projectId) assert.ok(ids.project.has(d.projectId));
  });

  it('marca todos os registros como demonstração e usa contatos fictícios', () => {
    for (const list of [data.opportunities, data.clients, data.projects, data.tasks, data.library, data.decisions]) {
      assert.ok(list.every((item) => item.isDemo === true));
    }
    const emails = [...data.clients, ...data.opportunities].map((x) => x.contact.email).filter(Boolean);
    assert.ok(emails.every((e) => e!.endsWith('@example.com')));
  });

  it('base vazia mantém apenas os perfis dos sócios', () => {
    const empty = createEmptyData(NOW);
    assert.equal(empty.users.length, 2);
    assert.equal(empty.tasks.length + empty.clients.length + empty.opportunities.length, 0);
    assert.equal(empty.meta.dataset, 'empty');
  });
});

describe('painel', () => {
  it('cumprimenta conforme o horário, sem slogans', () => {
    assert.equal(greeting('Maria Eduarda', new Date(2026, 9, 26, 8)), 'Bom dia, Maria Eduarda.');
    assert.equal(greeting('Wesley', new Date(2026, 9, 26, 14)), 'Boa tarde, Wesley.');
    assert.equal(greeting('Wesley', new Date(2026, 9, 26, 21)), 'Boa noite, Wesley.');
  });

  it('identifica tarefas atrasadas', () => {
    const overdue = overdueTasks(data, TODAY);
    assert.ok(overdue.length > 0);
    assert.ok(overdue.every((t) => t.dueDate! < TODAY && t.status !== 'concluida'));
  });

  it('prioridades do dia pertencem ao perfil e são urgentes', () => {
    const list = todayPriorities(data, TODAY, 'maria');
    assert.ok(list.length > 0 && list.length <= 5);
    for (const t of list) {
      assert.deepEqual(t.assigneeIds, ['maria']);
      assert.ok(t.dueDate! <= TODAY || t.priority === 'alta');
    }
  });

  it('próximos prazos ficam dentro da janela e em ordem', () => {
    const items = upcomingDeadlines(data, TODAY, 14);
    assert.ok(items.length > 0);
    for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].date <= items[i].date);
    assert.ok(items.every((d) => d.date >= TODAY && d.date <= addDays(TODAY, 14)));
    assert.ok(!items.some((d) => d.kind === 'installment'), 'parcelas só aparecem com permissão financeira');
    assert.ok(upcomingDeadlines(data, TODAY, 14, { includeFinance: true }).some((d) => d.kind === 'installment'));
  });
});

describe('tarefas', () => {
  it('cria, conclui e reabre uma tarefa', () => {
    const task = createTask(data, { title: '  Revisar textos  ', description: '', assigneeIds: ['wesley'], priority: 'media', status: 'a_fazer', dueDate: TODAY, related: null }, ctx);
    assert.equal(task.title, 'Revisar textos');
    assert.equal(task.createdBy, 'maria');
    toggleTaskDone(data, task.id, ctx);
    assert.equal(task.status, 'concluida');
    assert.ok(task.completedAt);
    toggleTaskDone(data, task.id, ctx);
    assert.equal(task.status, 'a_fazer');
    assert.equal(task.completedAt, null);
  });

  it('filtra por responsável e situação', () => {
    const wesleyLate = filterTasks(data.tasks, { assigneeId: 'wesley', status: 'atrasadas' }, TODAY);
    assert.ok(wesleyLate.length > 0);
    assert.ok(wesleyLate.every((t) => t.assigneeIds.includes('wesley') && isOverdue(t, TODAY)));
    const done = filterTasks(data.tasks, { assigneeId: 'todos', status: 'concluidas' }, TODAY);
    assert.ok(done.every((t) => t.status === 'concluida'));
  });
});

describe('comercial', () => {
  it('registra no histórico a mudança de etapa', () => {
    const before = data.opportunities.find((o) => o.id === 'opp_ferro')!.history.length;
    moveOpportunity(data, 'opp_ferro', 'abordagem_preparada', ctx);
    const opp = data.opportunities.find((o) => o.id === 'opp_ferro')!;
    assert.equal(opp.stage, 'abordagem_preparada');
    assert.equal(opp.history.length, before + 1);
    assert.match(opp.history.at(-1)!.text, /Qualificada → Abordagem preparada/);
  });

  it('ignora anotações vazias', () => {
    const opp = data.opportunities[0];
    const before = opp.history.length;
    addOpportunityNote(data, opp.id, '   ', ctx);
    assert.equal(opp.history.length, before);
  });

  it('converte oportunidade em cliente uma única vez', () => {
    const client = convertOpportunityToClient(data, 'opp_moenda', ctx);
    const opp = data.opportunities.find((o) => o.id === 'opp_moenda')!;
    assert.equal(opp.stage, 'ganho');
    assert.equal(opp.clientId, client.id);
    assert.equal(client.company, 'Café Moenda');
    const again = convertOpportunityToClient(data, 'opp_moenda', ctx);
    assert.equal(again.id, client.id);
    assert.equal(data.clients.filter((c) => c.company === 'Café Moenda').length, 1);
  });

  it('resume o funil sem somar oportunidades sem valor', () => {
    const s = pipelineSummary(data, TODAY);
    const open = data.opportunities.filter((o) => o.stage !== 'ganho' && o.stage !== 'perdido');
    assert.equal(s.openCount, open.length);
    assert.equal(s.openValue, open.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0));
    assert.equal(s.withoutValue, open.filter((o) => o.estimatedValue === null).length);
  });

  it('ao excluir uma oportunidade, as tarefas perdem o vínculo mas continuam existindo', () => {
    const count = data.tasks.length;
    deleteOpportunity(data, 'opp_moenda');
    assert.equal(data.tasks.length, count);
    assert.ok(!data.tasks.some((t) => t.related?.id === 'opp_moenda'));
  });
});

describe('clientes e pagamentos', () => {
  it('calcula recebido, em aberto e vencido', () => {
    const client = data.clients.find((c) => c.id === 'cli_trigo')!;
    const f = clientFinance(client, TODAY);
    assert.equal(f.total, 3800);
    assert.equal(f.paid, 1520);
    assert.equal(f.pending, 2280);
    assert.equal(f.overdue, 1140);
    assert.equal(f.overdueCount, 1);
  });

  it('marca e desmarca parcela como paga', () => {
    toggleInstallmentPaid(data, 'cli_trigo', 'par_tr2', TODAY);
    const inst = data.clients.find((c) => c.id === 'cli_trigo')!.installments.find((i) => i.id === 'par_tr2')!;
    assert.equal(inst.paidAt, TODAY);
    toggleInstallmentPaid(data, 'cli_trigo', 'par_tr2', TODAY);
    assert.equal(inst.paidAt, null);
  });

  it('recusa parcelas com valor zero ou negativo', () => {
    assert.throws(() => addInstallment(data, 'cli_trigo', { description: 'x', amount: 0, dueDate: TODAY, method: 'Pix' }));
  });
});

describe('projetos', () => {
  it('novo projeto recebe etapas e checklist padrão', () => {
    const p = createProject(data, { name: 'Loja', clientId: 'cli_lumen', ownerIds: ['wesley'], status: 'planejamento', startDate: TODAY, dueDate: addDays(TODAY, 30), description: '' }, ctx);
    assert.ok(p.stages.length >= 5);
    assert.ok(p.checklist.length >= 5);
    assert.equal(projectProgress(p), 0);
  });

  it('exige cliente existente', () => {
    assert.throws(() => createProject(data, { name: 'X', clientId: 'nao_existe', ownerIds: ['maria'], status: 'planejamento', startDate: TODAY, dueDate: TODAY, description: '' }, ctx));
  });

  it('avança etapas em ciclo e atualiza o progresso', () => {
    const project = data.projects.find((p) => p.id === 'prj_vitta')!;
    const stage = project.stages[0];
    cycleStageStatus(data, project.id, stage.id);
    assert.equal(stage.status, 'em_andamento');
    assert.ok(projectProgress(project) > 0);
    cycleStageStatus(data, project.id, stage.id);
    assert.equal(stage.status, 'concluida');
    cycleStageStatus(data, project.id, stage.id);
    assert.equal(stage.status, 'pendente');
  });

  it('projeto publicado com tudo concluído tem 100%', () => {
    assert.equal(projectProgress(data.projects.find((p) => p.id === 'prj_lumen')!), 100);
  });
});

describe('permissões', () => {
  it('sócios acessam financeiro; colaborador não', () => {
    assert.ok(can(data.users[0], 'finance:view'));
    assert.ok(!can({ id: 'x', name: 'X', shortName: 'X', role: 'colaborador', title: '' }, 'finance:view'));
    assert.ok(!can(null, 'tasks:edit'));
  });
});

describe('vários responsáveis', () => {
  it('tarefa com os dois sócios aparece para cada um', () => {
    const task = createTask(data, { title: 'Reunião com cliente', description: '', assigneeIds: ['maria', 'wesley'], priority: 'media', status: 'a_fazer', dueDate: addDays(TODAY, -1), related: null }, ctx);
    assert.deepEqual(task.assigneeIds, ['maria', 'wesley']);
    assert.ok(filterTasks(data.tasks, { assigneeId: 'maria', status: 'abertas' }, TODAY).includes(task));
    assert.ok(filterTasks(data.tasks, { assigneeId: 'wesley', status: 'abertas' }, TODAY).includes(task));
    assert.ok(overdueTasks(data, TODAY, 'wesley').includes(task));
  });

  it('cria pessoa nova pelo nome, sem duplicar', () => {
    const task = createTask(data, { title: 'Fotos', description: '', assigneeIds: ['maria', 'nova:Ana Souza', 'nova:ana souza', 'maria'], priority: 'media', status: 'a_fazer', dueDate: null, related: null }, ctx);
    const ana = data.users.find((u) => u.name === 'Ana Souza')!;
    assert.ok(ana.guest);
    assert.equal(ana.role, 'colaborador');
    assert.equal(data.users.filter((u) => u.name.toLowerCase() === 'ana souza').length, 1);
    assert.deepEqual(task.assigneeIds, ['maria', ana.id]);
    assert.equal(peopleNames(data, task.assigneeIds), 'Maria Eduarda e Ana');
  });

  it('exige pelo menos um responsável', () => {
    assert.throws(() => createTask(data, { title: 'Sem dono', description: '', assigneeIds: [], priority: 'media', status: 'a_fazer', dueDate: null, related: null }, ctx), /responsável/);
    assert.throws(() => createTask(data, { title: 'Sem dono', description: '', assigneeIds: ['nao_existe'], priority: 'media', status: 'a_fazer', dueDate: null, related: null }, ctx), /responsável/);
  });

  it('remover pessoa extra devolve o trabalho a quem removeu', () => {
    const ana = addPerson(data, 'Ana');
    const solo = createTask(data, { title: 'Só Ana', description: '', assigneeIds: [ana.id], priority: 'media', status: 'a_fazer', dueDate: null, related: null }, ctx);
    const shared = createTask(data, { title: 'Ana e Wesley', description: '', assigneeIds: [ana.id, 'wesley'], priority: 'media', status: 'a_fazer', dueDate: null, related: null }, ctx);
    removePerson(data, ana.id, 'maria');
    assert.deepEqual(solo.assigneeIds, ['maria']);
    assert.deepEqual(shared.assigneeIds, ['wesley']);
    assert.ok(!data.users.some((u) => u.id === ana.id));
    assert.throws(() => removePerson(data, 'wesley', 'maria'));
  });

  it('converte dados antigos com um único responsável', () => {
    const old = structuredClone(data) as unknown as { tasks: Record<string, unknown>[]; projects: Record<string, unknown>[]; opportunities: Record<string, unknown>[] };
    for (const t of old.tasks) { t.assigneeId = 'wesley'; delete t.assigneeIds; }
    for (const p of old.projects) { p.ownerId = 'maria'; delete p.ownerIds; }
    for (const o of old.opportunities) { o.ownerId = 'maria'; delete o.ownerIds; }
    const fixed = normalizeData(old as unknown as AppData);
    assert.ok(fixed.tasks.every((t) => t.assigneeIds.length === 1 && t.assigneeIds[0] === 'wesley' && !('assigneeId' in t)));
    assert.ok(fixed.projects.every((p) => p.ownerIds[0] === 'maria' && !('ownerId' in p)));
    assert.ok(fixed.opportunities.every((o) => o.ownerIds[0] === 'maria'));
    assert.deepEqual(normalizeData(structuredClone(fixed)), fixed);
  });
});
