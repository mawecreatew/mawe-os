/**
 * DADOS DE DEMONSTRAÇÃO — tudo aqui é fictício.
 *
 * Empresas, contatos e valores foram inventados para exibir o sistema
 * funcionando. E-mails usam o domínio reservado example.com e telefones são
 * fictícios. As datas são calculadas a partir do dia atual, para que prazos e
 * atrasos façam sentido sempre que o sistema for aberto.
 *
 * Somente Maria Eduarda e Wesley (os sócios) são pessoas reais.
 */
import { addDays, todayISO } from '../core/dates.ts';
import { DEFAULT_DELIVERY_CHECKLIST, DEFAULT_PRODUCTION_STAGES } from '../domain/templates.ts';
import type {
  AppData,
  ChecklistItem,
  Client,
  Decision,
  LibraryItem,
  Opportunity,
  ProductionStage,
  Project,
  StageStatus,
  Task,
  User,
} from '../domain/types.ts';
import { SCHEMA_VERSION } from './source.ts';

export const USERS: User[] = [
  { id: 'maria', name: 'Maria Eduarda', shortName: 'Maria Eduarda', role: 'socio', title: 'Sócia' },
  { id: 'wesley', name: 'Wesley', shortName: 'Wesley', role: 'socio', title: 'Sócio' },
];

export function createEmptyData(now: Date = new Date()): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    users: structuredClone(USERS),
    opportunities: [],
    clients: [],
    projects: [],
    tasks: [],
    library: [],
    decisions: [],
    conversations: [],
    meta: { dataset: 'empty', createdAt: now.toISOString() },
  };
}

export function createDemoData(now: Date = new Date()): AppData {
  const today = todayISO(now);
  const d = (days: number) => addDays(today, days);
  const ts = (days: number, hour = 10) => {
    const date = new Date(now);
    date.setDate(date.getDate() + days);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };
  const his = (id: string, days: number, authorId: string, text: string) => ({ id, at: ts(days), authorId, text });

  // ------------------------------------------------------------ Clientes
  const clients: Client[] = [
    {
      id: 'cli_trigo',
      company: 'Padaria Trigo Fino',
      contactName: 'Renata Albuquerque',
      segment: 'Alimentação',
      contact: { email: 'renata@example.com', phone: '(11) 90000-0101', instagram: '@trigofino.demo' },
      city: 'São Paulo, SP',
      contractStatus: 'em_andamento',
      installments: [
        { id: 'par_tr1', description: 'Entrada (40%)', amount: 1520, dueDate: d(-24), paidAt: d(-24), method: 'Pix' },
        { id: 'par_tr2', description: 'Aprovação do layout (30%)', amount: 1140, dueDate: d(-3), paidAt: null, method: 'Pix' },
        { id: 'par_tr3', description: 'Publicação (30%)', amount: 1140, dueDate: d(16), paidAt: null, method: 'Pix' },
      ],
      pendingItems: [
        { id: 'pen_tr1', text: 'Enviar fotos dos produtos em alta resolução', done: false },
        { id: 'pen_tr2', text: 'Confirmar horário de funcionamento aos domingos', done: true },
      ],
      nextStep: 'Cobrar gentilmente a parcela de aprovação do layout.',
      notes: 'Prefere contato por WhatsApp no período da tarde.',
      createdAt: ts(-30),
    },
    {
      id: 'cli_equilibrio',
      company: 'Studio Equilíbrio Pilates',
      contactName: 'Camila Rocha',
      segment: 'Saúde e bem-estar',
      contact: { email: 'camila@example.com', phone: '(11) 90000-0102', instagram: '@equilibrio.demo' },
      city: 'Campinas, SP',
      contractStatus: 'em_andamento',
      installments: [
        { id: 'par_eq1', description: 'Entrada (50%)', amount: 2250, dueDate: d(-12), paidAt: d(-11), method: 'Transferência' },
        { id: 'par_eq2', description: 'Entrega (50%)', amount: 2250, dueDate: d(9), paidAt: null, method: 'Transferência' },
      ],
      pendingItems: [{ id: 'pen_eq1', text: 'Receber textos sobre as modalidades de aula', done: false }],
      nextStep: 'Apresentar a primeira versão da página inicial.',
      notes: 'Quer integração com agenda de aulas no futuro (fora do escopo atual).',
      createdAt: ts(-15),
    },
    {
      id: 'cli_lumen',
      company: 'Lúmen Arquitetura',
      contactName: 'Diego Fontana',
      segment: 'Arquitetura e interiores',
      contact: { email: 'diego@example.com', phone: '(41) 90000-0103', website: 'lumen-demo.example.com' },
      city: 'Curitiba, PR',
      contractStatus: 'concluido',
      installments: [
        { id: 'par_lu1', description: 'Entrada (50%)', amount: 3100, dueDate: d(-70), paidAt: d(-70), method: 'Pix' },
        { id: 'par_lu2', description: 'Entrega (50%)', amount: 3100, dueDate: d(-20), paidAt: d(-18), method: 'Pix' },
      ],
      pendingItems: [],
      nextStep: 'Oferecer plano de manutenção mensal em 30 dias.',
      notes: 'Projeto de portfólio publicado. Cliente satisfeito; possível indicação.',
      createdAt: ts(-75),
    },
    {
      id: 'cli_vitta',
      company: 'Clínica Vitta Odonto',
      contactName: 'Dra. Helena Prado',
      segment: 'Saúde',
      contact: { email: 'helena@example.com', phone: '(31) 90000-0104' },
      city: 'Belo Horizonte, MG',
      contractStatus: 'contrato_assinado',
      installments: [
        { id: 'par_vi1', description: 'Entrada (40%)', amount: 2400, dueDate: d(2), paidAt: null, method: 'Boleto' },
        { id: 'par_vi2', description: 'Aprovação do layout (30%)', amount: 1800, dueDate: d(25), paidAt: null, method: 'Boleto' },
        { id: 'par_vi3', description: 'Publicação (30%)', amount: 1800, dueDate: d(45), paidAt: null, method: 'Boleto' },
      ],
      pendingItems: [
        { id: 'pen_vi1', text: 'Receber logo em arquivo vetorial', done: false },
        { id: 'pen_vi2', text: 'Agendar reunião de briefing', done: false },
      ],
      nextStep: 'Realizar reunião de briefing após confirmação da entrada.',
      notes: '',
      createdAt: ts(-4),
    },
  ];

  // ------------------------------------------------------------ Projetos
  const stages = (statuses: StageStatus[]): ProductionStage[] =>
    DEFAULT_PRODUCTION_STAGES.map((name, i) => ({ id: `stg_${i}`, name, status: statuses[i] ?? 'pendente' }));
  const checklist = (doneCount: number, prefix: string): ChecklistItem[] =>
    DEFAULT_DELIVERY_CHECKLIST.map((text, i) => ({ id: `chk_${prefix}${i}`, text, done: i < doneCount }));

  const projects: Project[] = [
    {
      id: 'prj_trigo',
      name: 'Site institucional e cardápio',
      clientId: 'cli_trigo',
      ownerIds: ['maria'],
      status: 'em_andamento',
      startDate: d(-24),
      dueDate: d(16),
      description: 'Site de 5 páginas com cardápio atualizável e botão de pedido via WhatsApp.',
      stages: stages(['concluida', 'concluida', 'concluida', 'em_andamento']),
      checklist: checklist(1, 'tr'),
      links: { repository: '', production: '', staging: '' },
      createdAt: ts(-24),
    },
    {
      id: 'prj_equilibrio',
      name: 'Landing page de aulas experimentais',
      clientId: 'cli_equilibrio',
      ownerIds: ['wesley'],
      status: 'em_revisao',
      startDate: d(-11),
      dueDate: d(9),
      description: 'Página única focada em agendamento de aula experimental.',
      stages: stages(['concluida', 'concluida', 'em_andamento']),
      checklist: checklist(0, 'eq'),
      links: { repository: '', production: '', staging: '' },
      createdAt: ts(-11),
    },
    {
      id: 'prj_lumen',
      name: 'Portfólio de projetos',
      clientId: 'cli_lumen',
      ownerIds: ['wesley'],
      status: 'publicado',
      startDate: d(-70),
      dueDate: d(-20),
      description: 'Portfólio com galeria de obras e página de contato.',
      stages: stages(['concluida', 'concluida', 'concluida', 'concluida', 'concluida', 'concluida']),
      checklist: checklist(DEFAULT_DELIVERY_CHECKLIST.length, 'lu'),
      links: { repository: '', production: '', staging: '' },
      createdAt: ts(-70),
    },
    {
      id: 'prj_vitta',
      name: 'Site da clínica com agendamento',
      clientId: 'cli_vitta',
      ownerIds: ['maria'],
      status: 'planejamento',
      startDate: d(3),
      dueDate: d(45),
      description: 'Site com páginas de tratamentos, equipe e botão de agendamento.',
      stages: stages([]),
      checklist: checklist(0, 'vi'),
      links: { repository: '', production: '', staging: '' },
      createdAt: ts(-4),
    },
  ];

  // ------------------------------------------------------------ Oportunidades
  const opp = (o: Omit<Opportunity, 'clientId' | 'isDemo'> & { clientId?: string }): Opportunity => ({
    clientId: null,
    ...o,
  });
  const opportunities: Opportunity[] = [
    opp({
      id: 'opp_moenda',
      contactName: 'Bruno Teixeira',
      company: 'Café Moenda',
      segment: 'Cafeteria',
      source: 'Instagram',
      contact: { instagram: '@cafemoenda.demo', phone: '(11) 90000-0201' },
      stage: 'negociacao',
      estimatedValue: 4200,
      nextAction: 'Enviar versão revisada da proposta com opção de parcelamento',
      followUpDate: today,
      ownerIds: ['maria'],
      notes: 'Quer site com cardápio e página de eventos. Sensível a preço.',
      history: [
        his('his_mo1', -14, 'maria', 'Oportunidade identificada pelo Instagram (perfil sem link de site).'),
        his('his_mo2', -9, 'maria', 'Primeira conversa por mensagem; demonstrou interesse.'),
        his('his_mo3', -4, 'wesley', 'Proposta enviada. Pediu condição de pagamento em 3 vezes.'),
      ],
      createdAt: ts(-14),
    }),
    opp({
      id: 'opp_nautica',
      contactName: 'Patrícia Lemos',
      company: 'Escola de Vela Ventura',
      segment: 'Esporte e lazer',
      source: 'Indicação',
      contact: { email: 'patricia@example.com' },
      stage: 'aguardando_resposta',
      estimatedValue: 5800,
      nextAction: 'Fazer acompanhamento sobre a proposta',
      followUpDate: d(-1),
      ownerIds: ['wesley'],
      notes: 'Indicada pela Lúmen Arquitetura (demo).',
      history: [
        his('his_na1', -10, 'wesley', 'Indicação recebida.'),
        his('his_na2', -6, 'wesley', 'Reunião online realizada; proposta enviada no mesmo dia.'),
      ],
      createdAt: ts(-10),
    }),
    opp({
      id: 'opp_aurora',
      contactName: 'Marcelo Antunes',
      company: 'Aurora Contabilidade',
      segment: 'Serviços profissionais',
      source: 'LinkedIn',
      contact: { email: 'marcelo@example.com' },
      stage: 'contato_realizado',
      estimatedValue: null,
      nextAction: 'Agendar conversa para entender a necessidade',
      followUpDate: d(2),
      ownerIds: ['wesley'],
      notes: 'Site atual desatualizado e lento no celular.',
      history: [his('his_au1', -3, 'wesley', 'Mensagem enviada pelo LinkedIn; respondeu pedindo mais informações.')],
      createdAt: ts(-5),
    }),
    opp({
      id: 'opp_brisa',
      contactName: 'Juliana Martins',
      company: 'Pousada Brisa do Vale',
      segment: 'Turismo',
      source: 'Google Maps',
      contact: { phone: '(35) 90000-0203' },
      stage: 'abordagem_preparada',
      estimatedValue: 6500,
      nextAction: 'Revisar a mensagem de abordagem e enviar',
      followUpDate: d(1),
      ownerIds: ['maria'],
      notes: 'Boas avaliações, mas reservas apenas por telefone. Oportunidade de site com reservas.',
      history: [his('his_br1', -2, 'maria', 'Abordagem personalizada redigida; aguardando revisão.')],
      createdAt: ts(-6),
    }),
    opp({
      id: 'opp_ferro',
      contactName: 'Rafael Couto',
      company: 'Couto Serralheria',
      segment: 'Indústria e serviços',
      source: 'Google Maps',
      contact: { phone: '(11) 90000-0204' },
      stage: 'qualificada',
      estimatedValue: 3200,
      nextAction: 'Preparar abordagem com exemplos de portfólio',
      followUpDate: d(4),
      ownerIds: ['maria'],
      notes: 'Sem presença online além do perfil no mapa.',
      history: [his('his_fe1', -1, 'maria', 'Qualificada: negócio ativo, ticket médio compatível.')],
      createdAt: ts(-3),
    }),
    opp({
      id: 'opp_petit',
      contactName: 'Sônia Ribeiro',
      company: 'Petit Ateliê Infantil',
      segment: 'Moda',
      source: 'Instagram',
      contact: { instagram: '@petitatelie.demo' },
      stage: 'em_analise',
      estimatedValue: null,
      nextAction: 'Verificar se já possui loja virtual',
      followUpDate: d(5),
      ownerIds: ['wesley'],
      notes: '',
      history: [],
      createdAt: ts(-2),
    }),
    opp({
      id: 'opp_ponto',
      contactName: 'A definir',
      company: 'Ponto Verde Floricultura',
      segment: 'Varejo',
      source: 'Google Maps',
      contact: {},
      stage: 'identificada',
      estimatedValue: null,
      nextAction: 'Pesquisar presença digital',
      followUpDate: d(6),
      ownerIds: ['maria'],
      notes: '',
      history: [],
      createdAt: ts(-1),
    }),
    opp({
      id: 'opp_lumen',
      contactName: 'Diego Fontana',
      company: 'Lúmen Arquitetura',
      segment: 'Arquitetura e interiores',
      source: 'Indicação',
      contact: { email: 'diego@example.com' },
      stage: 'ganho',
      estimatedValue: 6200,
      nextAction: '',
      followUpDate: null,
      ownerIds: ['wesley'],
      notes: '',
      history: [his('his_lu1', -72, 'wesley', 'Proposta aceita.')],
      clientId: 'cli_lumen',
      createdAt: ts(-80),
    }),
    opp({
      id: 'opp_vitta',
      contactName: 'Dra. Helena Prado',
      company: 'Clínica Vitta Odonto',
      segment: 'Saúde',
      source: 'Site da Mawe',
      contact: { email: 'helena@example.com' },
      stage: 'ganho',
      estimatedValue: 6000,
      nextAction: '',
      followUpDate: null,
      ownerIds: ['maria'],
      notes: '',
      history: [his('his_vi1', -5, 'maria', 'Contrato assinado.')],
      clientId: 'cli_vitta',
      createdAt: ts(-20),
    }),
    opp({
      id: 'opp_garagem',
      contactName: 'Otávio Nunes',
      company: 'Garagem 21 Estética Automotiva',
      segment: 'Automotivo',
      source: 'Instagram',
      contact: { instagram: '@garagem21.demo' },
      stage: 'perdido',
      estimatedValue: 2800,
      nextAction: '',
      followUpDate: null,
      ownerIds: ['wesley'],
      notes: 'Optou por uma solução pronta de construtor de sites. Retomar contato em 6 meses.',
      history: [his('his_ga1', -8, 'wesley', 'Cliente decidiu não seguir neste momento.')],
      createdAt: ts(-25),
    }),
  ];

  // ------------------------------------------------------------ Tarefas
  const task = (t: Omit<Task, 'createdAt' | 'completedAt' | 'createdBy' | 'description'> & Partial<Task>): Task => ({
    description: '',
    createdBy: t.assigneeIds[0],
    createdAt: ts(-5),
    completedAt: t.status === 'concluida' ? ts(-1) : null,
    ...t,
  });
  const tasks: Task[] = [
    task({ id: 'tsk_1', title: 'Revisar proposta do Café Moenda com parcelamento', assigneeIds: ['maria'], priority: 'alta', status: 'em_andamento', dueDate: today, related: { type: 'opportunity', id: 'opp_moenda' } }),
    task({ id: 'tsk_2', title: 'Finalizar seção de cardápio no site da Padaria', assigneeIds: ['maria'], priority: 'alta', status: 'em_andamento', dueDate: d(2), related: { type: 'project', id: 'prj_trigo' } }),
    task({ id: 'tsk_3', title: 'Solicitar fotos dos produtos à Padaria Trigo Fino', assigneeIds: ['maria'], priority: 'media', status: 'a_fazer', dueDate: d(-2), related: { type: 'client', id: 'cli_trigo' }, description: 'Pendência do cliente que está travando a página de produtos.' }),
    task({ id: 'tsk_4', title: 'Acompanhamento da proposta — Escola de Vela', assigneeIds: ['wesley'], priority: 'alta', status: 'a_fazer', dueDate: d(-1), related: { type: 'opportunity', id: 'opp_nautica' } }),
    task({ id: 'tsk_5', title: 'Ajustar versão mobile da landing do Studio Equilíbrio', assigneeIds: ['wesley'], priority: 'alta', status: 'em_revisao', dueDate: d(1), related: { type: 'project', id: 'prj_equilibrio' } }),
    task({ id: 'tsk_6', title: 'Revisar abordagem para a Pousada Brisa do Vale', assigneeIds: ['maria'], priority: 'media', status: 'a_fazer', dueDate: d(1), related: { type: 'opportunity', id: 'opp_brisa' } }),
    task({ id: 'tsk_7', title: 'Preparar roteiro do briefing da Clínica Vitta', assigneeIds: ['maria', 'wesley'], priority: 'media', status: 'a_fazer', dueDate: d(3), related: { type: 'project', id: 'prj_vitta' } }),
    task({ id: 'tsk_8', title: 'Configurar repositório do projeto Studio Equilíbrio', assigneeIds: ['wesley'], priority: 'baixa', status: 'a_fazer', dueDate: d(5), related: { type: 'project', id: 'prj_equilibrio' } }),
    task({ id: 'tsk_9', title: 'Atualizar checklist padrão de entrega na Biblioteca', assigneeIds: ['wesley'], priority: 'baixa', status: 'a_fazer', dueDate: d(8), related: null }),
    task({ id: 'tsk_10', title: 'Enviar lembrete da parcela de aprovação — Padaria', assigneeIds: ['wesley'], priority: 'media', status: 'a_fazer', dueDate: d(-3), related: { type: 'client', id: 'cli_trigo' } }),
    task({ id: 'tsk_11', title: 'Pesquisar presença digital da Ponto Verde Floricultura', assigneeIds: ['maria'], priority: 'baixa', status: 'a_fazer', dueDate: d(6), related: { type: 'opportunity', id: 'opp_ponto' } }),
    task({ id: 'tsk_12', title: 'Definir pacote de manutenção mensal', assigneeIds: ['wesley'], priority: 'media', status: 'a_fazer', dueDate: null, related: null, description: 'Ideia surgida após a entrega da Lúmen.' }),
    task({ id: 'tsk_13', title: 'Publicar portfólio da Lúmen Arquitetura', assigneeIds: ['wesley'], priority: 'alta', status: 'concluida', dueDate: d(-20), related: { type: 'project', id: 'prj_lumen' } }),
    task({ id: 'tsk_14', title: 'Aprovar layout da home com a Padaria', assigneeIds: ['maria'], priority: 'alta', status: 'concluida', dueDate: d(-6), related: { type: 'project', id: 'prj_trigo' } }),
  ];

  // ------------------------------------------------------------ Decisões
  const decisions: Decision[] = [
    { id: 'dec_1', date: d(-40), authorId: 'maria', title: 'Pagamento padrão em 3 etapas (40/30/30)', context: 'Entrada na assinatura, parcela na aprovação do layout e saldo na publicação. Reduz risco e acompanha as entregas.', projectId: null },
    { id: 'dec_2', date: d(-30), authorId: 'wesley', title: 'Todo projeto terá repositório próprio no GitHub', context: 'Facilita histórico de alterações, revisão de código e manutenção futura.', projectId: null },
    { id: 'dec_3', date: d(-21), authorId: 'maria', title: 'Cardápio será editável pelo cliente', context: 'A padaria troca produtos com frequência; evitar dependência da agência para ajustes simples.', projectId: 'prj_trigo' },
    { id: 'dec_4', date: d(-9), authorId: 'wesley', title: 'Landing com uma única chamada para ação', context: 'Foco total em agendar aula experimental; demais informações em seções secundárias.', projectId: 'prj_equilibrio' },
    { id: 'dec_5', date: d(-7), authorId: 'maria', title: 'Agentes de IA preparam, sócios aprovam', context: 'Nenhuma mensagem a cliente, publicação ou compromisso financeiro sai sem revisão humana.', projectId: null },
  ];

  // ------------------------------------------------------------ Biblioteca
  const lib = (l: Omit<LibraryItem, 'updatedAt'> & { daysAgo: number }): LibraryItem => {
    const { daysAgo, ...rest } = l;
    return { ...rest, updatedAt: ts(-daysAgo) };
  };
  const library: LibraryItem[] = [
    lib({
      id: 'lib_msg1',
      category: 'mensagem',
      title: 'Primeiro contato — negócio sem site',
      summary: 'Abordagem curta para negócios que só têm redes sociais.',
      content:
        'Olá, {{nome}}! Tudo bem?\n\nSou {{remetente}}, da Mawe Create. Conheci a {{empresa}} pelo {{origem}} e gostei muito de {{detalhe_positivo}}.\n\nPercebi que vocês ainda não têm um site próprio. Criamos sites sob medida que ajudam clientes a encontrar informações e entrar em contato com mais facilidade.\n\nPosso te mostrar dois exemplos de projetos parecidos? Sem compromisso.',
      authorId: 'maria',
      daysAgo: 12,
    }),
    lib({
      id: 'lib_msg2',
      category: 'mensagem',
      title: 'Acompanhamento após proposta',
      summary: 'Retorno educado 3 a 5 dias após o envio da proposta.',
      content:
        'Oi, {{nome}}! Passando para saber se conseguiu avaliar a proposta que enviamos para a {{empresa}}.\n\nSe quiser, posso ajustar algum ponto ou explicar melhor qualquer etapa. Fico à disposição.',
      authorId: 'wesley',
      daysAgo: 20,
    }),
    lib({
      id: 'lib_prop1',
      category: 'proposta',
      title: 'Proposta — site institucional',
      summary: 'Estrutura em 7 seções para sites de 3 a 6 páginas.',
      content:
        '1. Entendimento do negócio e objetivos\n2. Escopo: páginas e funcionalidades\n3. Etapas e cronograma\n4. O que está incluso (e o que não está)\n5. Investimento e forma de pagamento (40/30/30)\n6. Prazo de validade da proposta\n7. Próximos passos para começar',
      authorId: 'maria',
      daysAgo: 30,
    }),
    lib({
      id: 'lib_prop2',
      category: 'proposta',
      title: 'Proposta — landing page',
      summary: 'Versão enxuta para páginas únicas de conversão.',
      content:
        '1. Objetivo principal da página\n2. Público e mensagem central\n3. Seções previstas\n4. Prazo de entrega\n5. Investimento\n6. Próximos passos',
      authorId: 'wesley',
      daysAgo: 25,
    }),
    lib({
      id: 'lib_chk1',
      category: 'checklist',
      title: 'Checklist de entrega de site',
      summary: 'Verificações obrigatórias antes de publicar.',
      content: DEFAULT_DELIVERY_CHECKLIST.map((t) => `☐ ${t}`).join('\n'),
      authorId: 'wesley',
      daysAgo: 15,
    }),
    lib({
      id: 'lib_chk2',
      category: 'checklist',
      title: 'Checklist de início de projeto',
      summary: 'O que precisamos receber do cliente para começar.',
      content:
        '☐ Contrato assinado\n☐ Entrada confirmada\n☐ Logo em arquivo vetorial\n☐ Textos ou informações base\n☐ Fotos e imagens\n☐ Acessos (domínio, hospedagem, redes)\n☐ Reunião de briefing agendada',
      authorId: 'maria',
      daysAgo: 18,
    }),
    lib({
      id: 'lib_proc1',
      category: 'processo',
      title: 'Do contato ao contrato',
      summary: 'Fluxo comercial da agência, etapa por etapa.',
      content:
        '1. Identificar a oportunidade e registrar no Comercial\n2. Analisar presença digital e qualificar\n3. Preparar abordagem personalizada (revisão de um sócio)\n4. Fazer o contato e registrar no histórico\n5. Enviar proposta a partir da estrutura da Biblioteca\n6. Acompanhar em até 5 dias\n7. Ganho: converter em cliente, criar projeto e registrar parcelas',
      authorId: 'maria',
      daysAgo: 10,
    }),
    lib({
      id: 'lib_proc2',
      category: 'processo',
      title: 'Revisão e publicação',
      summary: 'Como revisamos e colocamos um site no ar.',
      content:
        '1. Revisão interna pelo sócio que não desenvolveu\n2. Ajustes registrados como tarefas\n3. Apresentação ao cliente em ambiente de teste\n4. Aprovação por escrito\n5. Publicação e checklist de entrega\n6. Registro dos links no projeto',
      authorId: 'wesley',
      daysAgo: 8,
    }),
  ];

  const markDemo = <T extends { isDemo?: boolean }>(items: T[]) => items.map((i) => ({ ...i, isDemo: true }));

  return {
    schemaVersion: SCHEMA_VERSION,
    users: structuredClone(USERS),
    opportunities: markDemo(opportunities),
    clients: markDemo(clients),
    projects: markDemo(projects),
    tasks: markDemo(tasks),
    library: markDemo(library),
    decisions: markDemo(decisions),
    conversations: [],
    meta: { dataset: 'demo', createdAt: now.toISOString() },
  };
}
