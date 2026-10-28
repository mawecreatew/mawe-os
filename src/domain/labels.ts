/** Rótulos em português e configuração visual de cada status. */
import type {
  AppData,
  ContentStatus,
  ContractStatus,
  LibraryCategory,
  OpportunityStage,
  PipelineStage,
  Priority,
  ProjectStatus,
  ProjectType,
  ProposalStatus,
  ServiceCategory,
  StageStatus,
  TaskStatus,
  Tone,
} from './types.ts';

export type { Tone };

export interface Option<T extends string> {
  value: T;
  label: string;
  tone: Tone;
}

/** Etapas finais e fixas do funil: contam nos resumos de ganhas/perdidas. */
export const WON_STAGE = 'ganho';
export const LOST_STAGE = 'perdido';
export const FINAL_STAGES: readonly OpportunityStage[] = [WON_STAGE, LOST_STAGE];

/** Etapas padrão do funil (usadas na primeira vez; depois os sócios podem editar). */
export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
  { id: 'identificada', label: 'Oportunidade identificada', tone: 'neutral' },
  { id: 'em_analise', label: 'Em análise', tone: 'neutral' },
  { id: 'qualificada', label: 'Qualificada', tone: 'info' },
  { id: 'abordagem_preparada', label: 'Abordagem preparada', tone: 'info' },
  { id: 'contato_realizado', label: 'Contato realizado', tone: 'progress' },
  { id: 'aguardando_resposta', label: 'Aguardando resposta', tone: 'warning' },
  { id: 'negociacao', label: 'Negociação', tone: 'accent' },
  { id: WON_STAGE, label: 'Ganho', tone: 'success' },
  { id: LOST_STAGE, label: 'Perdido', tone: 'danger' },
];

/** Tons que podem ser escolhidos para uma etapa do funil. */
export const STAGE_TONES: Option<Tone>[] = [
  { value: 'neutral', label: 'Neutro', tone: 'neutral' },
  { value: 'info', label: 'Azul', tone: 'info' },
  { value: 'progress', label: 'Marrom', tone: 'progress' },
  { value: 'warning', label: 'Âmbar', tone: 'warning' },
  { value: 'accent', label: 'Dourado', tone: 'accent' },
];

/** Etapas do funil na ordem configurada (com proteção para dados sem configuração). */
export function pipelineStages(data: Pick<AppData, 'pipelineStages'>): PipelineStage[] {
  return data.pipelineStages?.length ? data.pipelineStages : DEFAULT_PIPELINE_STAGES;
}

/** Etapas "abertas" (ainda em trabalho comercial), na ordem do funil. */
export function openStages(data: Pick<AppData, 'pipelineStages'>): OpportunityStage[] {
  return pipelineStages(data).map((s) => s.id).filter((id) => !FINAL_STAGES.includes(id));
}

export function isOpenStage(stage: OpportunityStage): boolean {
  return !FINAL_STAGES.includes(stage);
}

export function stageLabel(data: Pick<AppData, 'pipelineStages'>, stage: OpportunityStage): string {
  return pipelineStages(data).find((s) => s.id === stage)?.label ?? 'Etapa removida';
}

export function stageTone(data: Pick<AppData, 'pipelineStages'>, stage: OpportunityStage): Tone {
  return pipelineStages(data).find((s) => s.id === stage)?.tone ?? 'neutral';
}

/** Opções para campos de seleção de etapa. */
export function stageOptions(data: Pick<AppData, 'pipelineStages'>): Array<{ value: string; label: string }> {
  return pipelineStages(data).map((s) => ({ value: s.id, label: s.label }));
}

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

export const PROJECT_TYPES: Array<Option<ProjectType> & { description: string }> = [
  { value: 'site', label: 'Site', tone: 'neutral', description: 'Criação de site (fluxo completo de produção).' },
  { value: 'plano_mensal', label: 'Plano mensal', tone: 'accent', description: 'Ex.: Plano Essencial. Organizado mês a mês.' },
  { value: 'pacote_conteudo', label: 'Pacote de conteúdo', tone: 'info', description: 'Feed, stories e artes avulsas.' },
  { value: 'sistema', label: 'Sistema', tone: 'progress', description: 'Sistemas web desenvolvidos para clientes.' },
  { value: 'outro', label: 'Outro', tone: 'neutral', description: 'Serviços que ainda não têm categoria.' },
];

/** O status "publicado" só faz sentido para site/sistema; nos demais vira "concluído". */
export function projectStatusLabel(type: ProjectType, status: ProjectStatus): string {
  if (status === 'publicado' && type !== 'site' && type !== 'sistema') return 'Concluído';
  return labelOf(PROJECT_STATUSES, status);
}

export const CONTENT_STATUSES: Option<ContentStatus>[] = [
  { value: 'ideia', label: 'Ideia', tone: 'neutral' },
  { value: 'em_criacao', label: 'Em criação', tone: 'progress' },
  { value: 'aguardando_aprovacao', label: 'Aguardando aprovação', tone: 'warning' },
  { value: 'aprovado', label: 'Aprovado', tone: 'info' },
  { value: 'postado', label: 'Postado', tone: 'success' },
];

export const CONTENT_NETWORKS = ['Instagram', 'TikTok', 'WhatsApp', 'Facebook', 'Google Meu Negócio', 'Outra'];
export const CONTENT_FORMATS = ['Post no feed', 'Carrossel', 'Story', 'Reels', 'Vídeo', 'Status do WhatsApp', 'Outro'];

export const SERVICE_CATEGORIES: Option<ServiceCategory>[] = [
  { value: 'site', label: 'Site', tone: 'neutral' },
  { value: 'sistema', label: 'Sistema', tone: 'progress' },
  { value: 'conteudo', label: 'Conteúdo', tone: 'info' },
  { value: 'trafego', label: 'Tráfego pago', tone: 'warning' },
  { value: 'plano_mensal', label: 'Plano mensal', tone: 'accent' },
  { value: 'outro', label: 'Outro', tone: 'neutral' },
];

/** Tipo de projeto criado a partir de um serviço do catálogo. */
export function projectTypeForCategory(category: ServiceCategory): ProjectType {
  const map: Record<ServiceCategory, ProjectType> = {
    site: 'site',
    sistema: 'sistema',
    conteudo: 'pacote_conteudo',
    plano_mensal: 'plano_mensal',
    trafego: 'outro',
    outro: 'outro',
  };
  return map[category];
}

export const PROPOSAL_STATUSES: Option<ProposalStatus>[] = [
  { value: 'rascunho', label: 'Rascunho', tone: 'neutral' },
  { value: 'enviada', label: 'Enviada', tone: 'info' },
  { value: 'aceita', label: 'Aceita', tone: 'success' },
  { value: 'recusada', label: 'Recusada', tone: 'danger' },
];

export const PAYMENT_TERMS = ['50% no início e 50% na entrega', 'À vista no início', 'Pagamento na entrega', 'Mensal (todo mês)', 'Outro'];

export const EXPENSE_CATEGORIES = ['Ferramentas', 'Domínio', 'Hospedagem', 'Impostos', 'Marketing', 'Anúncios', 'Equipamentos', 'Outros'];
export const INCOME_CATEGORIES = ['Serviço avulso', 'Plano mensal', 'Indicação/comissão', 'Outros'];
/** Categoria usada para os pagamentos de clientes que vêm de Clientes (parcelas). */
export const CLIENT_INCOME_CATEGORY = 'Clientes';

export const CAMPAIGN_OBJECTIVES = ['Mensagens', 'Seguidores', 'Visitas no site', 'Engajamento', 'Alcance', 'Cadastros', 'Vendas', 'Outro'];

export const LEAD_SOURCES = ['Instagram', 'Indicação', 'Google Maps', 'Site da Mawe', 'LinkedIn', 'Evento', 'Outro'];

export function labelOf<T extends string>(options: Option<T>[], value: T): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function toneOf<T extends string>(options: Option<T>[], value: T): Tone {
  return options.find((o) => o.value === value)?.tone ?? 'neutral';
}
