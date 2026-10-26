/**
 * Cálculos derivados dos dados (sem efeitos colaterais).
 * As telas usam estas funções; os testes também.
 */
import { diffInDays, type ISODate } from '../core/dates.ts';
import { OPEN_STAGES } from './labels.ts';
import type {
  AppData,
  Client,
  ID,
  Opportunity,
  OpportunityStage,
  Priority,
  Project,
  RelatedRef,
  Task,
  User,
} from './types.ts';

export function greeting(name: string, now: Date = new Date()): string {
  const hour = now.getHours();
  const period = hour < 5 ? 'Boa noite' : hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  return `${period}, ${name}.`;
}

export function findUser(data: AppData, id: ID | null | undefined): User | undefined {
  return data.users.find((u) => u.id === id);
}

export function findClient(data: AppData, id: ID | null | undefined): Client | undefined {
  return data.clients.find((c) => c.id === id);
}

export function findProject(data: AppData, id: ID | null | undefined): Project | undefined {
  return data.projects.find((p) => p.id === id);
}

export function findOpportunity(data: AppData, id: ID | null | undefined): Opportunity | undefined {
  return data.opportunities.find((o) => o.id === id);
}

// ---------------------------------------------------------------- Tarefas

const PRIORITY_WEIGHT: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 };

export function isOpen(task: Task): boolean {
  return task.status !== 'concluida';
}

export function isOverdue(task: Task, today: ISODate): boolean {
  return isOpen(task) && task.dueDate !== null && task.dueDate < today;
}

/** Ordena por prazo (sem prazo por último) e depois por prioridade. */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.dueDate !== b.dueDate) {
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    return PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
  });
}

export function overdueTasks(data: AppData, today: ISODate, userId?: ID): Task[] {
  return sortTasks(data.tasks.filter((t) => isOverdue(t, today) && (!userId || t.assigneeId === userId)));
}

export function pendingTasks(data: AppData, today: ISODate, userId?: ID): Task[] {
  return sortTasks(
    data.tasks.filter((t) => isOpen(t) && !isOverdue(t, today) && (!userId || t.assigneeId === userId)),
  );
}

/**
 * Prioridades do dia: tarefas atrasadas ou com prazo hoje, mais as de prioridade
 * alta que vencem nos próximos 2 dias. Limitado para manter o foco.
 */
export function todayPriorities(data: AppData, today: ISODate, userId: ID, limit = 5): Task[] {
  const relevant = data.tasks.filter((t) => {
    if (!isOpen(t) || t.assigneeId !== userId || t.dueDate === null) return false;
    const days = diffInDays(today, t.dueDate);
    return days <= 0 || (t.priority === 'alta' && days <= 2);
  });
  return [...relevant]
    .sort((a, b) => {
      const pa = PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority];
      return pa !== 0 ? pa : (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
    })
    .slice(0, limit);
}

export type TaskStatusFilter = 'todas' | 'abertas' | 'atrasadas' | 'concluidas';

export interface TaskFilters {
  assigneeId: ID | 'todos';
  status: TaskStatusFilter;
  search?: string;
}

export function filterTasks(tasks: Task[], filters: TaskFilters, today: ISODate): Task[] {
  const term = filters.search?.trim().toLowerCase() ?? '';
  return sortTasks(
    tasks.filter((t) => {
      if (filters.assigneeId !== 'todos' && t.assigneeId !== filters.assigneeId) return false;
      if (filters.status === 'abertas' && !isOpen(t)) return false;
      if (filters.status === 'concluidas' && isOpen(t)) return false;
      if (filters.status === 'atrasadas' && !isOverdue(t, today)) return false;
      if (term && !`${t.title} ${t.description}`.toLowerCase().includes(term)) return false;
      return true;
    }),
  );
}

export function tasksRelatedTo(data: AppData, ref: RelatedRef): Task[] {
  return sortTasks(data.tasks.filter((t) => t.related?.type === ref.type && t.related.id === ref.id));
}

// ---------------------------------------------------------------- Prazos

export interface Deadline {
  kind: 'task' | 'project' | 'followup' | 'installment';
  id: ID;
  title: string;
  subtitle: string;
  date: ISODate;
  href: string;
}

/** Próximos prazos (tarefas, entregas de projeto, retornos comerciais e parcelas). */
export function upcomingDeadlines(
  data: AppData,
  today: ISODate,
  days = 14,
  options: { includeFinance?: boolean } = {},
): Deadline[] {
  const inWindow = (date: ISODate | null): date is ISODate =>
    date !== null && date >= today && diffInDays(today, date) <= days;
  const items: Deadline[] = [];

  for (const t of data.tasks) {
    if (isOpen(t) && inWindow(t.dueDate)) {
      items.push({
        kind: 'task',
        id: t.id,
        title: t.title,
        subtitle: `Tarefa · ${findUser(data, t.assigneeId)?.shortName ?? 'Sem responsável'}`,
        date: t.dueDate,
        href: '#/tarefas',
      });
    }
  }
  for (const p of data.projects) {
    if (p.status !== 'publicado' && inWindow(p.dueDate)) {
      items.push({
        kind: 'project',
        id: p.id,
        title: `Entrega: ${p.name}`,
        subtitle: `Projeto · ${findClient(data, p.clientId)?.company ?? ''}`,
        date: p.dueDate,
        href: `#/projetos/${p.id}`,
      });
    }
  }
  for (const o of data.opportunities) {
    if (OPEN_STAGES.includes(o.stage) && inWindow(o.followUpDate)) {
      items.push({
        kind: 'followup',
        id: o.id,
        title: `Retorno: ${o.company}`,
        subtitle: o.nextAction || 'Acompanhamento comercial',
        date: o.followUpDate,
        href: `#/comercial/${o.id}`,
      });
    }
  }
  if (options.includeFinance) {
    for (const c of data.clients) {
      for (const i of c.installments) {
        if (!i.paidAt && inWindow(i.dueDate)) {
          items.push({
            kind: 'installment',
            id: i.id,
            title: `Parcela: ${c.company}`,
            subtitle: i.description,
            date: i.dueDate,
            href: `#/clientes/${c.id}`,
          });
        }
      }
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------------------------------------------------------------- Comercial

export interface PipelineSummary {
  openCount: number;
  openValue: number;
  /** Oportunidades abertas sem valor estimado (não entram na soma). */
  withoutValue: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  followUpsDue: number;
  byStage: Record<OpportunityStage, number>;
}

export function pipelineSummary(data: AppData, today: ISODate): PipelineSummary {
  const byStage = {} as Record<OpportunityStage, number>;
  const summary: PipelineSummary = {
    openCount: 0,
    openValue: 0,
    withoutValue: 0,
    wonCount: 0,
    wonValue: 0,
    lostCount: 0,
    followUpsDue: 0,
    byStage,
  };
  for (const o of data.opportunities) {
    byStage[o.stage] = (byStage[o.stage] ?? 0) + 1;
    if (o.stage === 'ganho') {
      summary.wonCount++;
      summary.wonValue += o.estimatedValue ?? 0;
    } else if (o.stage === 'perdido') {
      summary.lostCount++;
    } else {
      summary.openCount++;
      if (o.estimatedValue === null) summary.withoutValue++;
      else summary.openValue += o.estimatedValue;
      if (o.followUpDate !== null && o.followUpDate <= today) summary.followUpsDue++;
    }
  }
  return summary;
}

export function opportunitiesByStage(data: AppData, stage: OpportunityStage): Opportunity[] {
  return data.opportunities
    .filter((o) => o.stage === stage)
    .sort((a, b) => (a.followUpDate ?? '9999').localeCompare(b.followUpDate ?? '9999'));
}

// ---------------------------------------------------------------- Projetos

/** Progresso combinando etapas de produção (peso maior) e checklist de entrega. */
export function projectProgress(project: Project): number {
  const stageScore = project.stages.reduce(
    (sum, s) => sum + (s.status === 'concluida' ? 1 : s.status === 'em_andamento' ? 0.5 : 0),
    0,
  );
  const stagePart = project.stages.length ? stageScore / project.stages.length : 0;
  const checkPart = project.checklist.length
    ? project.checklist.filter((c) => c.done).length / project.checklist.length
    : 0;
  if (!project.stages.length && !project.checklist.length) return 0;
  if (!project.checklist.length) return Math.round(stagePart * 100);
  if (!project.stages.length) return Math.round(checkPart * 100);
  return Math.round((stagePart * 0.7 + checkPart * 0.3) * 100);
}

export function currentStage(project: Project): string {
  const active = project.stages.find((s) => s.status === 'em_andamento');
  if (active) return active.name;
  const next = project.stages.find((s) => s.status === 'pendente');
  if (next) return `Próxima: ${next.name}`;
  return project.stages.length ? 'Etapas concluídas' : 'Sem etapas definidas';
}

export function activeProjects(data: AppData): Project[] {
  return data.projects
    .filter((p) => p.status !== 'publicado' && p.status !== 'pausado')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function projectsOfClient(data: AppData, clientId: ID): Project[] {
  return data.projects.filter((p) => p.clientId === clientId);
}

export function decisionsOf(data: AppData, projectId: ID | null): typeof data.decisions {
  return data.decisions
    .filter((d) => (projectId === null ? true : d.projectId === projectId))
    .sort((a, b) => b.date.localeCompare(a.date));
}

// ---------------------------------------------------------------- Financeiro

export interface ClientFinance {
  total: number;
  paid: number;
  pending: number;
  overdue: number;
  overdueCount: number;
  nextDue: { dueDate: ISODate; amount: number; description: string } | null;
}

export function clientFinance(client: Client, today: ISODate): ClientFinance {
  const result: ClientFinance = { total: 0, paid: 0, pending: 0, overdue: 0, overdueCount: 0, nextDue: null };
  const unpaid = [...client.installments].filter((i) => !i.paidAt).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  for (const i of client.installments) {
    result.total += i.amount;
    if (i.paidAt) result.paid += i.amount;
    else {
      result.pending += i.amount;
      if (i.dueDate < today) {
        result.overdue += i.amount;
        result.overdueCount++;
      }
    }
  }
  const next = unpaid[0];
  result.nextDue = next ? { dueDate: next.dueDate, amount: next.amount, description: next.description } : null;
  return result;
}

export function relatedLabel(data: AppData, ref: RelatedRef | null): { label: string; href: string } | null {
  if (!ref) return null;
  if (ref.type === 'project') {
    const p = findProject(data, ref.id);
    return p ? { label: p.name, href: `#/projetos/${p.id}` } : null;
  }
  if (ref.type === 'opportunity') {
    const o = findOpportunity(data, ref.id);
    return o ? { label: o.company, href: `#/comercial/${o.id}` } : null;
  }
  const c = findClient(data, ref.id);
  return c ? { label: c.company, href: `#/clientes/${c.id}` } : null;
}
