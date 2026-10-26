/** Rótulos em português e configuração visual de cada status. */
import type {
  ContractStatus,
  LibraryCategory,
  OpportunityStage,
  Priority,
  ProjectStatus,
  StageStatus,
  TaskStatus,
} from './types.ts';

export type Tone = 'neutral' | 'info' | 'progress' | 'warning' | 'success' | 'danger' | 'accent';

interface Option<T extends string> {
  value: T;
  label: string;
  tone: Tone;
}

export const OPPORTUNITY_STAGES: Option<OpportunityStage>[] = [
  { value: 'identificada', label: 'Oportunidade identificada', tone: 'neutral' },
  { value: 'em_analise', label: 'Em análise', tone: 'neutral' },
  { value: 'qualificada', label: 'Qualificada', tone: 'info' },
  { value: 'abordagem_preparada', label: 'Abordagem preparada', tone: 'info' },
  { value: 'contato_realizado', label: 'Contato realizado', tone: 'progress' },
  { value: 'aguardando_resposta', label: 'Aguardando resposta', tone: 'warning' },
  { value: 'negociacao', label: 'Negociação', tone: 'accent' },
  { value: 'ganho', label: 'Ganho', tone: 'success' },
  { value: 'perdido', label: 'Perdido', tone: 'danger' },
];

/** Etapas consideradas "abertas" (ainda em trabalho comercial). */
export const OPEN_STAGES: OpportunityStage[] = OPPORTUNITY_STAGES.map((s) => s.value).filter(
  (s) => s !== 'ganho' && s !== 'perdido',
);

export const PROJECT_STATUSES: Option<ProjectStatus>[] = [
  { value: 'planejamento', label: 'Planejamento', tone: 'neutral' },
  { value: 'em_andamento', label: 'Em andamento', tone: 'progress' },
  { value: 'em_revisao', label: 'Em revisão', tone: 'info' },
  { value: 'aguardando_cliente', label: 'Aguardando cliente', tone: 'warning' },
  { value: 'publicado', label: 'Publicado', tone: 'success' },
  { value: 'pausado', label: 'Pausado', tone: 'danger' },
];

export const STAGE_STATUSES: Option<StageStatus>[] = [
  { value: 'pendente', label: 'Pendente', tone: 'neutral' },
  { value: 'em_andamento', label: 'Em andamento', tone: 'progress' },
  { value: 'concluida', label: 'Concluída', tone: 'success' },
];

export const TASK_STATUSES: Option<TaskStatus>[] = [
  { value: 'a_fazer', label: 'A fazer', tone: 'neutral' },
  { value: 'em_andamento', label: 'Em andamento', tone: 'progress' },
  { value: 'em_revisao', label: 'Em revisão', tone: 'info' },
  { value: 'concluida', label: 'Concluída', tone: 'success' },
];

export const PRIORITIES: Option<Priority>[] = [
  { value: 'alta', label: 'Alta', tone: 'danger' },
  { value: 'media', label: 'Média', tone: 'warning' },
  { value: 'baixa', label: 'Baixa', tone: 'neutral' },
];

export const CONTRACT_STATUSES: Option<ContractStatus>[] = [
  { value: 'proposta_enviada', label: 'Proposta enviada', tone: 'info' },
  { value: 'contrato_assinado', label: 'Contrato assinado', tone: 'accent' },
  { value: 'em_andamento', label: 'Em andamento', tone: 'progress' },
  { value: 'concluido', label: 'Concluído', tone: 'success' },
  { value: 'pausado', label: 'Pausado', tone: 'danger' },
];

export const LIBRARY_CATEGORIES: Array<Option<LibraryCategory> & { plural: string; description: string }> = [
  {
    value: 'mensagem',
    label: 'Mensagem comercial',
    plural: 'Mensagens comerciais',
    description: 'Modelos de primeiro contato, acompanhamento e retorno.',
    tone: 'neutral',
  },
  {
    value: 'proposta',
    label: 'Estrutura de proposta',
    plural: 'Propostas',
    description: 'Esqueletos de propostas por tipo de projeto.',
    tone: 'neutral',
  },
  {
    value: 'checklist',
    label: 'Checklist',
    plural: 'Checklists',
    description: 'Listas de verificação de produção e entrega.',
    tone: 'neutral',
  },
  {
    value: 'processo',
    label: 'Processo interno',
    plural: 'Processos',
    description: 'Como a agência trabalha, passo a passo.',
    tone: 'neutral',
  },
];

export const LEAD_SOURCES = ['Instagram', 'Indicação', 'Google Maps', 'Site da Mawe', 'LinkedIn', 'Evento', 'Outro'];

export function labelOf<T extends string>(options: Option<T>[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function toneOf<T extends string>(options: Option<T>[], value: T): Tone {
  return options.find((o) => o.value === value)?.tone ?? 'neutral';
}
