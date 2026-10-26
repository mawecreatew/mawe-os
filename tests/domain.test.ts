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
      assert.ok(ids.user.has(t.assigneeId), `responsável inválido em ${t.id}`);
      if (t.related) assert.ok(ids[t.related.type].has(t.related.id), `vínculo inválido em ${t.id}`);
    }
    for (const p of data.projects) {
      assert.ok(ids.client.has(p.clientId));
      assert.ok(ids.user.has(p.ownerId));
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
      assert.equal(t.assigneeId, 'maria');
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
    const task = createTask(data, { title: '  Revisar textos  ', description: '', assigneeId: 'wesley', priority: 'media', status: 'a_fazer', dueDate: TODAY, related: null }, ctx);
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
    assert.ok(wesleyLate.every((t) => t.assigneeId === 'wesley' && isOverdue(t, TODAY)));
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
    const p = createProject(data, { name: 'Loja', clientId: 'cli_lumen', ownerId: 'wesley', status: 'planejamento', startDate: TODAY, dueDate: addDays(TODAY, 30), description: '' }, ctx);
    assert.ok(p.stages.length >= 5);
    assert.ok(p.checklist.length >= 5);
    assert.equal(projectProgress(p), 0);
  });

  it('exige cliente existente', () => {
    assert.throws(() => createProject(data, { name: 'X', clientId: 'nao_existe', ownerId: 'maria', status: 'planejamento', startDate: TODAY, dueDate: TODAY, description: '' }, ctx));
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
