/**
 * Operações que alteram os dados.
 *
 * Cada função recebe um rascunho (`draft`) — uma cópia dos dados — e o modifica.
 * O store aplica a operação, salva e atualiza a tela. Manter as regras aqui
 * (e não nas telas) facilita testar e, no futuro, mover a lógica para um
 * servidor/banco de dados.
 */
import { addMonths, isValidISODate, lastDayOfMonth, monthKey, monthLabel, shiftMonth, todayISO, type ISODate } from '../core/dates.ts';
import { createId } from '../core/id.ts';
import { FINAL_STAGES, WON_STAGE, isOpenStage, stageLabel } from './labels.ts';
import { fixFinalStages } from './normalize.ts';
import { resolvePeople } from './people.ts';
import { PROJECT_TEMPLATES } from './templates.ts';
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
  PipelineStage,
  Project,
  ProjectExtra,
  ProjectType,
  StageStatus,
  Tone,
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

/**
 * Responsáveis vindos de um formulário: aceita IDs e pessoas novas
 * (`nova:Nome`, que são cadastradas aqui). Precisa sobrar pelo menos uma.
 */
function responsibles(draft: AppData, values: readonly string[]): ID[] {
  const ids = resolvePeople(draft, values);
  if (!ids.length) throw new Error('Escolha pelo menos um responsável.');
  return ids;
}

function checklistFrom(texts: string[]): ChecklistItem[] {
  return texts.map((text) => ({ id: createId('chk'), text, done: false }));
}

// ---------------------------------------------------------------- Tarefas

/** `assigneeIds` aceita IDs de pessoas e nomes novos no formato `nova:Nome`. */
export type TaskInput = Pick<Task, 'title' | 'description' | 'assigneeIds' | 'priority' | 'status' | 'dueDate' | 'related'>;

export function createTask(draft: AppData, input: TaskInput, ctx: ActionContext): Task {
  const task: Task = {
    id: createId('tsk'),
    ...input,
    title: input.title.trim(),
    assigneeIds: responsibles(draft, input.assigneeIds),
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
  if (patch.assigneeIds !== undefined) task.assigneeIds = responsibles(draft, patch.assigneeIds);
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
  | 'ownerIds'
  | 'notes'
> & { contactedAt?: ISODate | null; repliedAt?: ISODate | null };

function historyEntry(text: string, ctx: ActionContext) {
  return { id: createId('his'), at: ctx.now.toISOString(), authorId: ctx.userId, text };
}

function mustBeStage(draft: AppData, stage: OpportunityStage): void {
  if (!draft.pipelineStages.some((s) => s.id === stage)) throw new Error('Etapa do funil não encontrada. Atualize a página e tente de novo.');
}

export function createOpportunity(draft: AppData, input: OpportunityInput, ctx: ActionContext): Opportunity {
  mustBeStage(draft, input.stage);
  const opportunity: Opportunity = {
    id: createId('opp'),
    ...input,
    company: input.company.trim(),
    ownerIds: responsibles(draft, input.ownerIds),
    history: [historyEntry(`Oportunidade cadastrada em "${stageLabel(draft, input.stage)}".`, ctx)],
    clientId: null,
    contactedAt: input.contactedAt ?? null,
    repliedAt: input.repliedAt ?? null,
    createdAt: ctx.now.toISOString(),
  };
  draft.opportunities.push(opportunity);
  return opportunity;
}

export function updateOpportunity(draft: AppData, id: ID, patch: Partial<OpportunityInput>, ctx: ActionContext): void {
  const opp = mustFind(draft.opportunities, id, 'Oportunidade');
  const previousStage = opp.stage;
  if (patch.stage !== undefined) mustBeStage(draft, patch.stage);
  Object.assign(opp, patch);
  if (patch.ownerIds !== undefined) opp.ownerIds = responsibles(draft, patch.ownerIds);
  if (patch.stage && patch.stage !== previousStage) {
    opp.history.push(
      historyEntry(
        `Etapa alterada: ${stageLabel(draft, previousStage)} → ${stageLabel(draft, patch.stage)}.`,
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
  if (opp.stage !== WON_STAGE) moveOpportunity(draft, id, WON_STAGE, ctx);
  opp.history.push(historyEntry('Convertida em cliente.', ctx));
  return client;
}

/** Marca (ou desmarca, com `null`) o dia do contato de prospecção ou da resposta. */
export function setOpportunityMilestone(
  draft: AppData,
  id: ID,
  field: 'contactedAt' | 'repliedAt',
  date: ISODate | null,
  ctx: ActionContext,
): void {
  const opp = mustFind(draft.opportunities, id, 'Oportunidade');
  if (date !== null && !isValidISODate(date)) throw new Error('Data inválida.');
  opp[field] = date;
  // Quem respondeu, obviamente, recebeu contato.
  if (field === 'repliedAt' && date && !opp.contactedAt) opp.contactedAt = date;
  if (field === 'contactedAt' && date === null) opp.repliedAt = null;
  const text =
    field === 'contactedAt'
      ? date ? 'Contato de prospecção registrado.' : 'Registro de contato removido.'
      : date ? 'Resposta da empresa registrada.' : 'Registro de resposta removido.';
  opp.history.push(historyEntry(text, ctx));
}

// ---------------------------------------------------------------- Etapas do funil

function cleanStageLabel(label: string): string {
  const clean = label.replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!clean) throw new Error('Digite o nome da etapa.');
  return clean;
}

function stageSlug(label: string): string {
  return (
    label
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 24) || 'etapa'
  );
}

/** Adiciona uma etapa aberta, antes de "Ganho" (ou depois de `afterId`, se informado). */
export function addPipelineStage(draft: AppData, label: string, tone: Tone = 'neutral', afterId?: OpportunityStage): PipelineStage {
  const name = cleanStageLabel(label);
  if (draft.pipelineStages.some((s) => s.label.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
    throw new Error(`Já existe uma etapa chamada "${name}".`);
  }
  let id = stageSlug(name);
  if (draft.pipelineStages.some((s) => s.id === id)) id = `${id}_${createId('x').slice(2, 7)}`;
  const stage: PipelineStage = { id, label: name, tone: tone === 'success' || tone === 'danger' ? 'neutral' : tone };
  const open = draft.pipelineStages.filter((s) => !FINAL_STAGES.includes(s.id));
  const index = afterId ? open.findIndex((s) => s.id === afterId) + 1 : open.length;
  open.splice(index > 0 ? index : open.length, 0, stage);
  draft.pipelineStages = fixFinalStages([...open, ...draft.pipelineStages.filter((s) => FINAL_STAGES.includes(s.id))]);
  return stage;
}

/** Renomeia uma etapa (inclusive Ganho e Perdido) e, nas abertas, troca a cor. */
export function updatePipelineStage(draft: AppData, id: OpportunityStage, patch: { label?: string; tone?: Tone }): void {
  const stage = mustFind(draft.pipelineStages, id, 'Etapa');
  if (patch.label !== undefined) {
    const name = cleanStageLabel(patch.label);
    if (draft.pipelineStages.some((s) => s.id !== id && s.label.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
      throw new Error(`Já existe uma etapa chamada "${name}".`);
    }
    stage.label = name;
  }
  if (patch.tone !== undefined && isOpenStage(id) && patch.tone !== 'success' && patch.tone !== 'danger') stage.tone = patch.tone;
}

/** Move uma etapa aberta uma posição para cima (-1) ou para baixo (+1). Ganho e Perdido não se movem. */
export function movePipelineStage(draft: AppData, id: OpportunityStage, direction: -1 | 1): void {
  if (!isOpenStage(id)) throw new Error('"Ganho" e "Perdido" ficam sempre no fim do funil.');
  const open = draft.pipelineStages.filter((s) => isOpenStage(s.id));
  const index = open.findIndex((s) => s.id === id);
  if (index < 0) throw new Error('Etapa não encontrada.');
  const target = index + direction;
  if (target < 0 || target >= open.length) return;
  [open[index], open[target]] = [open[target], open[index]];
  draft.pipelineStages = fixFinalStages([...open, ...draft.pipelineStages.filter((s) => !isOpenStage(s.id))]);
}

/** Coloca as etapas abertas exatamente na ordem informada (usado ao arrastar). */
export function reorderPipelineStages(draft: AppData, orderedIds: OpportunityStage[]): void {
  const open = draft.pipelineStages.filter((s) => isOpenStage(s.id));
  if (orderedIds.length !== open.length || !open.every((s) => orderedIds.includes(s.id))) {
    throw new Error('A lista de etapas mudou. Atualize a página e tente de novo.');
  }
  const sorted = orderedIds.map((id) => open.find((s) => s.id === id)!);
  draft.pipelineStages = fixFinalStages([...sorted, ...draft.pipelineStages.filter((s) => !isOpenStage(s.id))]);
}

/**
 * Remove uma etapa aberta. As oportunidades que estão nela vão para `targetId`
 * (com registro no histórico), então nada se perde.
 */
export function removePipelineStage(draft: AppData, id: OpportunityStage, targetId: OpportunityStage | null, ctx: ActionContext): number {
  if (!isOpenStage(id)) throw new Error('"Ganho" e "Perdido" são etapas finais e não podem ser removidas.');
  const stage = mustFind(draft.pipelineStages, id, 'Etapa');
  const open = draft.pipelineStages.filter((s) => isOpenStage(s.id));
  if (open.length <= 1) throw new Error('O funil precisa ter pelo menos uma etapa aberta.');
  const affected = draft.opportunities.filter((o) => o.stage === id);
  if (affected.length) {
    if (!targetId || targetId === id) throw new Error('Escolha para qual etapa mover as oportunidades desta etapa.');
    mustBeStage(draft, targetId);
    for (const o of affected) {
      o.stage = targetId;
      o.history.push(historyEntry(`Etapa "${stage.label}" removida do funil. Oportunidade movida para "${stageLabel(draft, targetId)}".`, ctx));
    }
  }
  draft.pipelineStages = draft.pipelineStages.filter((s) => s.id !== id);
  return affected.length;
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
  'name' | 'clientId' | 'ownerIds' | 'status' | 'startDate' | 'dueDate' | 'description'
> & {
  links?: Partial<Project['links']>;
  type?: ProjectType;
  extra?: Partial<ProjectExtra>;
  /** Plano mensal: mês de referência (AAAA-MM). */
  period?: string | null;
  serviceId?: ID | null;
};

export interface ProjectCreateOptions {
  /** Substitui o checklist padrão do tipo (ex.: itens de um serviço do catálogo). */
  checklist?: string[];
  /** Itens somados ao checklist padrão (ex.: quantidade de posts e stories). */
  extraChecklist?: string[];
}

const EMPTY_EXTRA: ProjectExtra = { artsFolder: '', social: '', amount: null, billingDay: null };

function cleanExtra(extra: Partial<ProjectExtra> | undefined, base: ProjectExtra = EMPTY_EXTRA): ProjectExtra {
  const merged = { ...base, ...extra };
  if (merged.amount !== null && !(merged.amount >= 0)) throw new Error('O valor do plano não pode ser negativo.');
  if (merged.billingDay !== null && !(Number.isInteger(merged.billingDay) && merged.billingDay >= 1 && merged.billingDay <= 31)) {
    throw new Error('O dia de vencimento deve ser um número de 1 a 31.');
  }
  return merged;
}

/** "Plano Essencial – The House – Novembro/2026" (sem repetir o mês se já estiver no nome). */
export function monthlyPlanName(baseName: string, clientName: string, period: string): string {
  const base = baseName.replace(/\s*[–-]\s*[A-Za-zÀ-ú]+\/\d{4}\s*$/, '').trim();
  const withClient = clientName && !base.toLocaleLowerCase('pt-BR').includes(clientName.toLocaleLowerCase('pt-BR')) ? `${base} – ${clientName}` : base;
  return `${withClient} – ${monthLabel(period)}`;
}

export function createProject(draft: AppData, input: ProjectInput, ctx: ActionContext, options: ProjectCreateOptions = {}): Project {
  const client = mustFind(draft.clients, input.clientId, 'Cliente');
  const type: ProjectType = input.type ?? 'site';
  const template = PROJECT_TEMPLATES[type];
  const startDate = input.startDate || todayISO(ctx.now);
  let name = input.name.trim();
  if (!name) throw new Error('Informe o nome do projeto.');
  let period: string | null = null;
  let dueDate = input.dueDate;
  if (type === 'plano_mensal') {
    period = input.period || monthKey(startDate);
    if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('Mês do plano inválido.');
    name = monthlyPlanName(name, client.company, period);
    if (!dueDate) dueDate = lastDayOfMonth(period);
  }
  if (!dueDate) throw new Error('Informe o prazo do projeto.');
  const id = createId('prj');
  const project: Project = {
    id,
    name,
    clientId: input.clientId,
    ownerIds: responsibles(draft, input.ownerIds),
    status: input.status,
    startDate,
    dueDate,
    description: input.description,
    stages: template.stages.map((stageName) => ({ id: createId('stg'), name: stageName, status: 'pendente' as const })),
    checklist: checklistFrom([...(options.checklist ?? template.checklist), ...(options.extraChecklist ?? [])].map((t) => t.trim()).filter(Boolean)),
    links: { repository: '', production: '', staging: '', ...input.links },
    type,
    extra: cleanExtra(input.extra),
    period,
    seriesId: type === 'plano_mensal' ? id : null,
    serviceId: input.serviceId ?? null,
    createdAt: ctx.now.toISOString(),
  };
  draft.projects.push(project);
  return project;
}

export function updateProject(draft: AppData, id: ID, patch: Partial<ProjectInput>): void {
  const project = mustFind(draft.projects, id, 'Projeto');
  const { links, extra, type, ...rest } = patch;
  Object.assign(project, rest);
  if (rest.name !== undefined) project.name = rest.name.trim();
  if (rest.ownerIds !== undefined) project.ownerIds = responsibles(draft, rest.ownerIds);
  if (links) project.links = { ...project.links, ...links };
  if (extra) project.extra = cleanExtra(extra, project.extra);
  // O tipo é escolhido na criação; trocar depois mudaria etapas e checklist já em uso.
  void type;
}

/** Exclui um projeto. Tarefas e conteúdos ficam, só perdem o vínculo; decisões do projeto são removidas. */
export function deleteProject(draft: AppData, id: ID): void {
  mustFind(draft.projects, id, 'Projeto');
  draft.projects = draft.projects.filter((p) => p.id !== id);
  for (const t of draft.tasks) if (t.related?.type === 'project' && t.related.id === id) t.related = null;
  draft.decisions = draft.decisions.filter((d) => d.projectId !== id);
  for (const c of draft.contents) if (c.projectId === id) c.projectId = null;
  for (const p of draft.proposals) p.projectIds = p.projectIds.filter((x) => x !== id);
}

/** Meses de um mesmo plano mensal, do mais recente para o mais antigo. */
export function planMonths(data: AppData, project: Project): Project[] {
  if (project.type !== 'plano_mensal') return [project];
  const series = project.seriesId ?? project.id;
  return data.projects
    .filter((p) => p.type === 'plano_mensal' && (p.seriesId ?? p.id) === series)
    .sort((a, b) => (b.period ?? '').localeCompare(a.period ?? ''));
}

/**
 * Renova um plano mensal: cria o mês seguinte com as mesmas etapas e checklist
 * (desmarcados), mesmos responsáveis, links e valores. O mês atual fica no histórico.
 */
export function renewMonthlyPlan(draft: AppData, id: ID, ctx: ActionContext): Project {
  const current = mustFind(draft.projects, id, 'Projeto');
  if (current.type !== 'plano_mensal') throw new Error('Só planos mensais podem ser renovados para o próximo mês.');
  const series = current.seriesId ?? current.id;
  const latest = planMonths(draft, current)[0];
  const period = shiftMonth(latest.period ?? monthKey(latest.startDate), 1);
  if (draft.projects.some((p) => (p.seriesId ?? p.id) === series && p.period === period)) {
    throw new Error(`Este plano já tem o mês ${monthLabel(period)}.`);
  }
  const client = draft.clients.find((c) => c.id === latest.clientId);
  const startDate = `${period}-01`;
  const project: Project = {
    ...structuredClone(latest),
    id: createId('prj'),
    name: monthlyPlanName(latest.name, client?.company ?? '', period),
    status: 'planejamento',
    startDate,
    dueDate:
      !latest.dueDate || (latest.period && latest.dueDate === lastDayOfMonth(latest.period))
        ? lastDayOfMonth(period)
        : addMonths(latest.dueDate, 1),
    stages: latest.stages.map((s) => ({ id: createId('stg'), name: s.name, status: 'pendente' as const })),
    checklist: latest.checklist.map((c) => ({ id: createId('chk'), text: c.text, done: false })),
    period,
    seriesId: series,
    createdAt: ctx.now.toISOString(),
    isDemo: undefined,
  };
  delete project.isDemo;
  if (!latest.seriesId) latest.seriesId = series;
  draft.projects.push(project);
  return project;
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
