/**
 * Operações que alteram os dados.
 *
 * Cada função recebe um rascunho (`draft`) — uma cópia dos dados — e o modifica.
 * O store aplica a operação, salva e atualiza a tela. Manter as regras aqui
 * (e não nas telas) facilita testar e, no futuro, mover a lógica para um
 * servidor/banco de dados.
 */
import { todayISO, type ISODate } from '../core/dates.ts';
import { createId } from '../core/id.ts';
import { labelOf, OPPORTUNITY_STAGES } from './labels.ts';
import { DEFAULT_DELIVERY_CHECKLIST, DEFAULT_PRODUCTION_STAGES } from './templates.ts';
import type {
  AgentId,
  AppData,
  ChecklistItem,
  Client,
  ConversationMessage,
  Decision,
  ID,
  Installment,
  LibraryItem,
  Opportunity,
  OpportunityStage,
  Project,
  StageStatus,
  Task,
  TaskStatus,
} from './types.ts';

/** Quem está fazendo a alteração e quando (para históricos). */
export interface ActionContext {
  userId: ID;
  now: Date;
}

function mustFind<T extends { id: ID }>(list: T[], id: ID, what: string): T {
  const item = list.find((x) => x.id === id);
  if (!item) throw new Error(`${what} não encontrado(a): ${id}`);
  return item;
}

function checklistFrom(texts: string[]): ChecklistItem[] {
  return texts.map((text) => ({ id: createId('chk'), text, done: false }));
}

// ---------------------------------------------------------------- Tarefas

export type TaskInput = Pick<Task, 'title' | 'description' | 'assigneeId' | 'priority' | 'status' | 'dueDate' | 'related'>;

export function createTask(draft: AppData, input: TaskInput, ctx: ActionContext): Task {
  const task: Task = {
    id: createId('tsk'),
    ...input,
    title: input.title.trim(),
    createdBy: ctx.userId,
    createdAt: ctx.now.toISOString(),
    completedAt: input.status === 'concluida' ? ctx.now.toISOString() : null,
  };
  draft.tasks.push(task);
  return task;
}

export function updateTask(draft: AppData, id: ID, patch: Partial<TaskInput>, ctx: ActionContext): void {
  const task = mustFind(draft.tasks, id, 'Tarefa');
  const wasDone = task.status === 'concluida';
  Object.assign(task, patch);
  if (patch.title !== undefined) task.title = patch.title.trim();
  if (task.status === 'concluida' && !wasDone) task.completedAt = ctx.now.toISOString();
  if (task.status !== 'concluida') task.completedAt = null;
}

export function setTaskStatus(draft: AppData, id: ID, status: TaskStatus, ctx: ActionContext): void {
  updateTask(draft, id, { status }, ctx);
}

export function toggleTaskDone(draft: AppData, id: ID, ctx: ActionContext): void {
  const task = mustFind(draft.tasks, id, 'Tarefa');
  setTaskStatus(draft, id, task.status === 'concluida' ? 'a_fazer' : 'concluida', ctx);
}

export function deleteTask(draft: AppData, id: ID): void {
  draft.tasks = draft.tasks.filter((t) => t.id !== id);
}

// ---------------------------------------------------------------- Oportunidades

export type OpportunityInput = Pick<
  Opportunity,
  | 'contactName'
  | 'company'
  | 'segment'
  | 'source'
  | 'contact'
  | 'stage'
  | 'estimatedValue'
  | 'nextAction'
  | 'followUpDate'
  | 'ownerId'
  | 'notes'
>;

function historyEntry(text: string, ctx: ActionContext) {
  return { id: createId('his'), at: ctx.now.toISOString(), authorId: ctx.userId, text };
}

export function createOpportunity(draft: AppData, input: OpportunityInput, ctx: ActionContext): Opportunity {
  const opportunity: Opportunity = {
    id: createId('opp'),
    ...input,
    company: input.company.trim(),
    history: [historyEntry(`Oportunidade cadastrada em "${labelOf(OPPORTUNITY_STAGES, input.stage)}".`, ctx)],
    clientId: null,
    createdAt: ctx.now.toISOString(),
  };
  draft.opportunities.push(opportunity);
  return opportunity;
}

export function updateOpportunity(draft: AppData, id: ID, patch: Partial<OpportunityInput>, ctx: ActionContext): void {
  const opp = mustFind(draft.opportunities, id, 'Oportunidade');
  const previousStage = opp.stage;
  Object.assign(opp, patch);
  if (patch.stage && patch.stage !== previousStage) {
    opp.history.push(
      historyEntry(
        `Etapa alterada: ${labelOf(OPPORTUNITY_STAGES, previousStage)} → ${labelOf(OPPORTUNITY_STAGES, patch.stage)}.`,
        ctx,
      ),
    );
  }
}

export function moveOpportunity(draft: AppData, id: ID, stage: OpportunityStage, ctx: ActionContext): void {
  updateOpportunity(draft, id, { stage }, ctx);
}

export function addOpportunityNote(draft: AppData, id: ID, text: string, ctx: ActionContext): void {
  const clean = text.trim();
  if (!clean) return;
  mustFind(draft.opportunities, id, 'Oportunidade').history.push(historyEntry(clean, ctx));
}

export function deleteOpportunity(draft: AppData, id: ID): void {
  draft.opportunities = draft.opportunities.filter((o) => o.id !== id);
  for (const t of draft.tasks) if (t.related?.type === 'opportunity' && t.related.id === id) t.related = null;
}

/** Cria um cliente a partir de uma oportunidade ganha e liga os dois registros. */
export function convertOpportunityToClient(draft: AppData, id: ID, ctx: ActionContext): Client {
  const opp = mustFind(draft.opportunities, id, 'Oportunidade');
  if (opp.clientId) return mustFind(draft.clients, opp.clientId, 'Cliente');
  const client = createClient(
    draft,
    {
      company: opp.company,
      contactName: opp.contactName,
      segment: opp.segment,
      contact: { ...opp.contact },
      city: '',
      contractStatus: 'proposta_enviada',
      nextStep: 'Enviar contrato e combinar forma de pagamento.',
      notes: opp.notes,
    },
    ctx,
  );
  opp.clientId = client.id;
  if (opp.stage !== 'ganho') moveOpportunity(draft, id, 'ganho', ctx);
  opp.history.push(historyEntry('Convertida em cliente.', ctx));
  return client;
}

// ---------------------------------------------------------------- Clientes

export type ClientInput = Pick<
  Client,
  'company' | 'contactName' | 'segment' | 'contact' | 'city' | 'contractStatus' | 'nextStep' | 'notes'
>;

export function createClient(draft: AppData, input: ClientInput, ctx: ActionContext): Client {
  const client: Client = {
    id: createId('cli'),
    ...input,
    company: input.company.trim(),
    installments: [],
    pendingItems: [],
    createdAt: ctx.now.toISOString(),
  };
  draft.clients.push(client);
  return client;
}

export function updateClient(draft: AppData, id: ID, patch: Partial<ClientInput>): void {
  Object.assign(mustFind(draft.clients, id, 'Cliente'), patch);
}

export type InstallmentInput = Pick<Installment, 'description' | 'amount' | 'dueDate' | 'method'>;

export function addInstallment(draft: AppData, clientId: ID, input: InstallmentInput): Installment {
  if (!(input.amount > 0)) throw new Error('O valor da parcela deve ser maior que zero.');
  const installment: Installment = { id: createId('par'), ...input, paidAt: null };
  const client = mustFind(draft.clients, clientId, 'Cliente');
  client.installments.push(installment);
  client.installments.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return installment;
}

/** Marca/desmarca uma parcela como paga. Registro manual: não movimenta dinheiro. */
export function toggleInstallmentPaid(draft: AppData, clientId: ID, installmentId: ID, paidOn: ISODate): void {
  const client = mustFind(draft.clients, clientId, 'Cliente');
  const inst = mustFind(client.installments, installmentId, 'Parcela');
  inst.paidAt = inst.paidAt ? null : paidOn;
}

export function removeInstallment(draft: AppData, clientId: ID, installmentId: ID): void {
  const client = mustFind(draft.clients, clientId, 'Cliente');
  client.installments = client.installments.filter((i) => i.id !== installmentId);
}

export function addPendingItem(draft: AppData, clientId: ID, text: string): void {
  const clean = text.trim();
  if (!clean) return;
  mustFind(draft.clients, clientId, 'Cliente').pendingItems.push({ id: createId('pen'), text: clean, done: false });
}

export function togglePendingItem(draft: AppData, clientId: ID, itemId: ID): void {
  const item = mustFind(mustFind(draft.clients, clientId, 'Cliente').pendingItems, itemId, 'Pendência');
  item.done = !item.done;
}

// ---------------------------------------------------------------- Projetos

export type ProjectInput = Pick<
  Project,
  'name' | 'clientId' | 'ownerId' | 'status' | 'startDate' | 'dueDate' | 'description'
> & { links?: Partial<Project['links']> };

export function createProject(draft: AppData, input: ProjectInput, ctx: ActionContext): Project {
  mustFind(draft.clients, input.clientId, 'Cliente');
  const project: Project = {
    id: createId('prj'),
    name: input.name.trim(),
    clientId: input.clientId,
    ownerId: input.ownerId,
    status: input.status,
    startDate: input.startDate || todayISO(ctx.now),
    dueDate: input.dueDate,
    description: input.description,
    stages: DEFAULT_PRODUCTION_STAGES.map((name) => ({ id: createId('stg'), name, status: 'pendente' as const })),
    checklist: checklistFrom(DEFAULT_DELIVERY_CHECKLIST),
    links: { repository: '', production: '', staging: '', ...input.links },
    createdAt: ctx.now.toISOString(),
  };
  draft.projects.push(project);
  return project;
}

export function updateProject(draft: AppData, id: ID, patch: Partial<ProjectInput>): void {
  const project = mustFind(draft.projects, id, 'Projeto');
  const { links, ...rest } = patch;
  Object.assign(project, rest);
  if (links) project.links = { ...project.links, ...links };
}

export function setStageStatus(draft: AppData, projectId: ID, stageId: ID, status: StageStatus): void {
  const project = mustFind(draft.projects, projectId, 'Projeto');
  mustFind(project.stages, stageId, 'Etapa').status = status;
}

/** Avança a etapa: pendente → em andamento → concluída → pendente. */
export function cycleStageStatus(draft: AppData, projectId: ID, stageId: ID): void {
  const project = mustFind(draft.projects, projectId, 'Projeto');
  const stage = mustFind(project.stages, stageId, 'Etapa');
  const next: Record<StageStatus, StageStatus> = {
    pendente: 'em_andamento',
    em_andamento: 'concluida',
    concluida: 'pendente',
  };
  stage.status = next[stage.status];
}

export function addChecklistItem(draft: AppData, projectId: ID, text: string): void {
  const clean = text.trim();
  if (!clean) return;
  mustFind(draft.projects, projectId, 'Projeto').checklist.push({ id: createId('chk'), text: clean, done: false });
}

export function toggleChecklistItem(draft: AppData, projectId: ID, itemId: ID): void {
  const item = mustFind(mustFind(draft.projects, projectId, 'Projeto').checklist, itemId, 'Item');
  item.done = !item.done;
}

export function removeChecklistItem(draft: AppData, projectId: ID, itemId: ID): void {
  const project = mustFind(draft.projects, projectId, 'Projeto');
  project.checklist = project.checklist.filter((c) => c.id !== itemId);
}

// ---------------------------------------------------------------- Decisões

export type DecisionInput = Pick<Decision, 'title' | 'context' | 'projectId'> & { date?: ISODate };

export function addDecision(draft: AppData, input: DecisionInput, ctx: ActionContext): Decision {
  const decision: Decision = {
    id: createId('dec'),
    title: input.title.trim(),
    context: input.context.trim(),
    projectId: input.projectId,
    date: input.date || todayISO(ctx.now),
    authorId: ctx.userId,
  };
  draft.decisions.push(decision);
  return decision;
}

export function removeDecision(draft: AppData, id: ID): void {
  draft.decisions = draft.decisions.filter((d) => d.id !== id);
}

// ---------------------------------------------------------------- Biblioteca

export type LibraryInput = Pick<LibraryItem, 'category' | 'title' | 'summary' | 'content'>;

export function saveLibraryItem(draft: AppData, id: ID | null, input: LibraryInput, ctx: ActionContext): LibraryItem {
  if (id) {
    const item = mustFind(draft.library, id, 'Item da biblioteca');
    Object.assign(item, input, { updatedAt: ctx.now.toISOString(), authorId: ctx.userId });
    return item;
  }
  const item: LibraryItem = {
    id: createId('lib'),
    ...input,
    authorId: ctx.userId,
    updatedAt: ctx.now.toISOString(),
  };
  draft.library.push(item);
  return item;
}

export function deleteLibraryItem(draft: AppData, id: ID): void {
  draft.library = draft.library.filter((l) => l.id !== id);
}

// ---------------------------------------------------------------- Conversas com agentes

export function appendMessage(
  draft: AppData,
  agentId: AgentId,
  message: Omit<ConversationMessage, 'id' | 'at'>,
  ctx: ActionContext,
): ConversationMessage {
  let conversation = draft.conversations.find((c) => c.agentId === agentId);
  if (!conversation) {
    conversation = { agentId, messages: [] };
    draft.conversations.push(conversation);
  }
  const full: ConversationMessage = { id: createId('msg'), at: ctx.now.toISOString(), ...message };
  conversation.messages.push(full);
  return full;
}

export function clearConversation(draft: AppData, agentId: AgentId): void {
  draft.conversations = draft.conversations.filter((c) => c.agentId !== agentId);
}
