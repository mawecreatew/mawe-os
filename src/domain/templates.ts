/** Padrões da agência usados ao criar um novo projeto. Ajuste conforme o processo evoluir. */

export const DEFAULT_PRODUCTION_STAGES = [
  'Briefing e alinhamento',
  'Arquitetura de conteúdo',
  'Design das páginas',
  'Desenvolvimento',
  'Revisão com o cliente',
  'Publicação',
];

export const DEFAULT_DELIVERY_CHECKLIST = [
  'Textos finais aprovados pelo cliente',
  'Layout testado em celular, tablet e computador',
  'Títulos e descrições para buscadores (SEO básico)',
  'Formulários e botões de contato testados',
  'Domínio e certificado SSL configurados',
  'Velocidade de carregamento verificada',
  'Acessos e orientações entregues ao cliente',
];

import type { ProjectType, Service } from './types.ts';

/** Etapas e checklist padrão de cada tipo de projeto. Site continua exatamente como antes. */
export const PROJECT_TEMPLATES: Record<ProjectType, { stages: string[]; checklist: string[] }> = {
  site: { stages: DEFAULT_PRODUCTION_STAGES, checklist: DEFAULT_DELIVERY_CHECKLIST },
  plano_mensal: {
    stages: ['Planejamento do mês', 'Produção', 'Aprovação do cliente', 'Execução', 'Relatório do mês'],
    checklist: [
      'Movimentar o grupo do cliente',
      'Atualizar o Google Meu Negócio',
      'Atualizar a capa do WhatsApp',
      'Enviar o relatório do mês ao cliente',
    ],
  },
  pacote_conteudo: {
    stages: ['Briefing', 'Criação das artes', 'Aprovação', 'Entrega / postagem'],
    checklist: ['Posts do feed combinados', 'Stories combinados', 'Artes enviadas para aprovação', 'Arquivos finais entregues ao cliente'],
  },
  sistema: {
    stages: ['Briefing', 'Planejamento', 'Desenvolvimento', 'Testes', 'Entrega'],
    checklist: [
      'Funcionalidades combinadas testadas',
      'Testado no celular e no computador',
      'Dados de exemplo removidos',
      'Acessos e orientações entregues ao cliente',
    ],
  },
  outro: { stages: ['Início', 'Execução', 'Entrega'], checklist: [] },
};

/**
 * Catálogo inicial de serviços (tabela de preços da agência). Os IDs são
 * fixos para que o catálogo gerado ao atualizar dados antigos seja sempre o
 * mesmo, nos dois navegadores. Os sócios podem editar ou desativar tudo.
 */
export const STARTER_SERVICES: Service[] = [
  { id: 'svc_one_page', name: 'Site one page', category: 'site', includes: 'Site de uma página só, com seções e botão de WhatsApp\nAté 2 rodadas de alterações', price: 500, billing: 'unico', deliveryDays: 7, active: true },
  { id: 'svc_landing', name: 'Landing page', category: 'site', includes: 'Página focada em conversão (venda ou captação)\nAté 2 rodadas de alterações', price: 600, billing: 'unico', deliveryDays: 7, active: true },
  { id: 'svc_hotsite', name: 'Hotsite', category: 'site', includes: 'Site para campanha ou evento\nAté 2 rodadas de alterações', price: 700, billing: 'unico', deliveryDays: 10, active: true },
  { id: 'svc_portfolio', name: 'Site portfólio', category: 'site', includes: 'Galeria de trabalhos e apresentação profissional\nAté 2 rodadas de alterações', price: 800, billing: 'unico', deliveryDays: 10, active: true },
  { id: 'svc_institucional', name: 'Site institucional', category: 'site', includes: 'Várias páginas (início, sobre, serviços, contato)\nAté 2 rodadas de alterações', price: 900, billing: 'unico', deliveryDays: 12, active: true },
  { id: 'svc_essencial', name: 'Plano Essencial', category: 'plano_mensal', includes: 'Pequenas alterações\nSuporte básico', price: 49, billing: 'mensal', deliveryDays: null, active: true },
  { id: 'svc_profissional', name: 'Plano Profissional', category: 'plano_mensal', includes: 'Alterações recorrentes\nAtualizações\nSuporte prioritário', price: 99, billing: 'mensal', deliveryDays: null, active: true },
  { id: 'svc_avancado', name: 'Plano Avançado', category: 'plano_mensal', includes: 'Manutenção contínua\nAlterações frequentes\nAcompanhamento', price: 179, billing: 'mensal', deliveryDays: null, active: true },
  { id: 'svc_dominio', name: 'Cadastro de domínio', category: 'outro', includes: 'Registro do domínio em nome do cliente (a taxa anual do registro é paga pelo cliente)', price: 25, billing: 'unico', deliveryDays: 1, active: true },
];
