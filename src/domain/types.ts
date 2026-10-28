/**
 * Modelo de dados do Mawe OS.
 *
 * Estes tipos descrevem o "formato" de cada informação da agência. Eles são a
 * base para a futura migração a um banco de dados: cada interface principal
 * corresponde a uma tabela (users, opportunities, clients, projects, tasks...).
 */
import type { ISODate } from '../core/dates.ts';

export type ID = string;
/** Data e hora completas (ISO 8601), usada em registros e históricos. */
export type Timestamp = string;

// ---------------------------------------------------------------- Pessoas

export type Role = 'socio' | 'colaborador';

export interface User {
  id: ID;
  name: string;
  shortName: string;
  role: Role;
  title: string;
  /** Pessoa cadastrada só para receber tarefas (freelancer, ajudante): não faz login. */
  guest?: boolean;
}

// ---------------------------------------------------------------- Comercial

/**
 * Etapa do funil. As etapas são configuráveis pelos sócios (ficam em
 * `AppData.pipelineStages`); apenas `ganho` e `perdido` são fixas e finais.
 */
export type OpportunityStage = string;

export type Tone = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'danger' | 'accent';

export interface PipelineStage {
  id: OpportunityStage;
  label: string;
  tone: Tone;
}

export interface HistoryEntry {
  id: ID;
  at: Timestamp;
  authorId: ID;
  text: string;
}

export interface ContactInfo {
  email?: string;
  phone?: string;
  instagram?: string;
  website?: string;
}

export interface Opportunity {
  id: ID;
  contactName: string;
  company: string;
  segment: string;
  source: string;
  contact: ContactInfo;
  stage: OpportunityStage;
  estimatedValue: number | null;
  nextAction: string;
  followUpDate: ISODate | null;
  /** Responsáveis (um ou mais). */
  ownerIds: ID[];
  notes: string;
  history: HistoryEntry[];
  clientId: ID | null;
  /** Dia em que o primeiro contato de prospecção foi feito (alimenta as metas). */
  contactedAt?: ISODate | null;
  /** Dia em que a empresa respondeu ao contato. */
  repliedAt?: ISODate | null;
  createdAt: Timestamp;
  isDemo?: boolean;
}

// ---------------------------------------------------------------- Clientes

export type ContractStatus = 'proposta_enviada' | 'contrato_assinado' | 'em_andamento' | 'concluido' | 'pausado';

export interface Installment {
  id: ID;
  description: string;
  amount: number;
  dueDate: ISODate;
  paidAt: ISODate | null;
  method: string;
}

export interface ChecklistItem {
  id: ID;
  text: string;
  done: boolean;
}

export interface Client {
  id: ID;
  company: string;
  contactName: string;
  segment: string;
  contact: ContactInfo;
  city: string;
  contractStatus: ContractStatus;
  installments: Installment[];
  pendingItems: ChecklistItem[];
  nextStep: string;
  notes: string;
  createdAt: Timestamp;
  isDemo?: boolean;
}

// ---------------------------------------------------------------- Projetos

export type ProjectStatus =
  | 'planejamento'
  | 'em_andamento'
  | 'em_revisao'
  | 'aguardando_cliente'
  | 'publicado'
  | 'pausado';

export type StageStatus = 'pendente' | 'em_andamento' | 'concluida';

export interface ProductionStage {
  id: ID;
  name: string;
  status: StageStatus;
}

export type ProjectType = 'site' | 'plano_mensal' | 'pacote_conteudo' | 'sistema' | 'outro';

export interface ProjectLinks {
  repository: string;
  production: string;
  staging: string;
}

/** Campos usados por planos mensais, pacotes de conteúdo e outros serviços. */
export interface ProjectExtra {
  /** Pasta das artes (Drive, Canva). */
  artsFolder: string;
  /** Redes sociais do cliente (texto livre: @perfil, links). */
  social: string;
  /** Valor do plano/pacote. */
  amount: number | null;
  /** Dia do mês em que o plano vence. */
  billingDay: number | null;
}

export interface Project {
  id: ID;
  name: string;
  clientId: ID;
  /** Responsáveis (um ou mais). */
  ownerIds: ID[];
  status: ProjectStatus;
  startDate: ISODate;
  dueDate: ISODate;
  description: string;
  stages: ProductionStage[];
  checklist: ChecklistItem[];
  links: ProjectLinks;
  /** Tipo de trabalho. Dados antigos sem tipo são tratados como `site`. */
  type: ProjectType;
  extra: ProjectExtra;
  /** Plano mensal: mês de referência (AAAA-MM). */
  period?: string | null;
  /** Plano mensal: liga os meses de um mesmo plano (id do primeiro mês). */
  seriesId?: ID | null;
  /** Serviço do catálogo que originou o projeto, se houver. */
  serviceId?: ID | null;
  createdAt: Timestamp;
  isDemo?: boolean;
}

// ---------------------------------------------------------------- Financeiro

/** Quem pagou uma despesa: a conta da agência ou um sócio, do próprio bolso. */
export type Payer = 'agencia' | ID;

export interface FinanceEntry {
  id: ID;
  kind: 'entrada' | 'saida';
  description: string;
  amount: number;
  /** Vencimento (saída) ou data prevista (entrada). */
  dueDate: ISODate;
  /** Quando foi pago/recebido. `null` = a pagar / a receber. */
  paidAt: ISODate | null;
  category: string;
  paidBy: Payer;
  clientId: ID | null;
  /** Ocorrência gerada a partir de uma despesa recorrente. */
  recurringId: ID | null;
  notes: string;
  createdAt: Timestamp;
  isDemo?: boolean;
}

export interface RecurringExpense {
  id: ID;
  description: string;
  amount: number;
  category: string;
  frequency: 'mensal' | 'anual';
  /** Primeiro vencimento; os próximos repetem o mesmo dia. */
  startDate: ISODate;
  active: boolean;
  paidBy: Payer;
  createdAt: Timestamp;
  isDemo?: boolean;
}

export interface FinanceData {
  entries: FinanceEntry[];
  recurring: RecurringExpense[];
}

// ---------------------------------------------------------------- Calendário de conteúdo

export type ContentStatus = 'ideia' | 'em_criacao' | 'aguardando_aprovacao' | 'aprovado' | 'postado';

export interface ContentItem {
  id: ID;
  title: string;
  /** `null` = conteúdo da própria MaweCreate. */
  clientId: ID | null;
  projectId: ID | null;
  date: ISODate;
  time: string;
  network: string;
  format: string;
  caption: string;
  artLink: string;
  notes: string;
  status: ContentStatus;
  createdAt: Timestamp;
  isDemo?: boolean;
}

// ---------------------------------------------------------------- Tráfego pago

export interface Campaign {
  id: ID;
  name: string;
  /** `null` = campanha da própria MaweCreate. */
  clientId: ID | null;
  platform: string;
  objective: string;
  startDate: ISODate;
  endDate: ISODate | null;
  budget: number | null;
  spent: number | null;
  reach: number | null;
  clicks: number | null;
  results: number | null;
  learnings: string;
  createdAt: Timestamp;
  isDemo?: boolean;
}

// ---------------------------------------------------------------- Serviços e preços

export type ServiceCategory = 'site' | 'sistema' | 'conteudo' | 'trafego' | 'plano_mensal' | 'outro';

export interface Service {
  id: ID;
  name: string;
  category: ServiceCategory;
  includes: string;
  price: number;
  billing: 'unico' | 'mensal';
  /** Prazo médio de entrega, em dias úteis. */
  deliveryDays: number | null;
  active: boolean;
  isDemo?: boolean;
}

// ---------------------------------------------------------------- Propostas

export type ProposalStatus = 'rascunho' | 'enviada' | 'aceita' | 'recusada';

export interface ProposalItem {
  id: ID;
  serviceId: ID | null;
  name: string;
  category: ServiceCategory;
  price: number;
  billing: 'unico' | 'mensal';
  quantity: number;
}

export interface Proposal {
  id: ID;
  title: string;
  /** Para quem é: um cliente já cadastrado ou uma oportunidade do funil. */
  clientId: ID | null;
  opportunityId: ID | null;
  items: ProposalItem[];
  status: ProposalStatus;
  sentAt: ISODate | null;
  decidedAt: ISODate | null;
  validUntil: ISODate | null;
  notes: string;
  /** Contrato: link do PDF assinado (Drive), início e forma de pagamento. */
  contractLink: string;
  startDate: ISODate | null;
  paymentTerms: string;
  projectIds: ID[];
  createdBy: ID;
  createdAt: Timestamp;
  isDemo?: boolean;
}

// ---------------------------------------------------------------- Metas

export interface MonthlyGoals {
  revenue: number | null;
  newClients: number | null;
  contacts: number | null;
  proposalsSent: number | null;
  proposalsAccepted: number | null;
}

// ---------------------------------------------------------------- Tarefas

export type TaskStatus = 'a_fazer' | 'em_andamento' | 'em_revisao' | 'concluida';
export type Priority = 'alta' | 'media' | 'baixa';

export interface RelatedRef {
  type: 'project' | 'opportunity' | 'client';
  id: ID;
}

export interface Task {
  id: ID;
  title: string;
  description: string;
  /** Responsáveis (um ou mais). */
  assigneeIds: ID[];
  priority: Priority;
  status: TaskStatus;
  dueDate: ISODate | null;
  related: RelatedRef | null;
  createdBy: ID;
  createdAt: Timestamp;
  completedAt: Timestamp | null;
  isDemo?: boolean;
}

// ---------------------------------------------------------------- Biblioteca e decisões

export type LibraryCategory = 'mensagem' | 'proposta' | 'checklist' | 'processo';

export interface LibraryItem {
  id: ID;
  category: LibraryCategory;
  title: string;
  summary: string;
  content: string;
  authorId: ID;
  updatedAt: Timestamp;
  isDemo?: boolean;
}

/** Decisão importante. Sem `projectId`, é uma decisão da agência como um todo. */
export interface Decision {
  id: ID;
  date: ISODate;
  authorId: ID;
  title: string;
  context: string;
  projectId: ID | null;
  isDemo?: boolean;
}

// ---------------------------------------------------------------- Agentes

export type AgentId = 'coordenador' | 'comercial' | 'organizacao' | 'tecnico';

export interface ConversationMessage {
  id: ID;
  /** `user` = escrito por uma pessoa; `system` = aviso do próprio Mawe OS (nunca IA). */
  role: 'user' | 'system';
  authorId: ID | null;
  text: string;
  at: Timestamp;
  routing?: { agentId: AgentId; matched: string[] } | null;
}

export interface Conversation {
  agentId: AgentId;
  messages: ConversationMessage[];
}

// ---------------------------------------------------------------- Raiz

export interface AppData {
  schemaVersion: number;
  users: User[];
  opportunities: Opportunity[];
  clients: Client[];
  projects: Project[];
  tasks: Task[];
  library: LibraryItem[];
  decisions: Decision[];
  conversations: Conversation[];
  /** Etapas do funil comercial, na ordem. `ganho` e `perdido` ficam sempre no fim. */
  pipelineStages: PipelineStage[];
  finance: FinanceData;
  contents: ContentItem[];
  campaigns: Campaign[];
  services: Service[];
  proposals: Proposal[];
  /** Metas por mês (chave AAAA-MM). */
  goals: Record<string, MonthlyGoals>;
  meta: {
    /** `demo` = dados fictícios carregados; `empty` = base limpa para uso real local. */
    dataset: 'demo' | 'empty';
    createdAt: Timestamp;
  };
}
