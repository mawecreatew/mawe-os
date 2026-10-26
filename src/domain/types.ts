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

export type OpportunityStage =
  | 'identificada'
  | 'em_analise'
  | 'qualificada'
  | 'abordagem_preparada'
  | 'contato_realizado'
  | 'aguardando_resposta'
  | 'negociacao'
  | 'ganho'
  | 'perdido';

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

export interface ProjectLinks {
  repository: string;
  production: string;
  staging: string;
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
  createdAt: Timestamp;
  isDemo?: boolean;
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
  meta: {
    /** `demo` = dados fictícios carregados; `empty` = base limpa para uso real local. */
    dataset: 'demo' | 'empty';
    createdAt: Timestamp;
  };
}
