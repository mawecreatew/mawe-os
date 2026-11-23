/**
 * Manual de processos da agência: como cada etapa é feita, por quem e em
 * quanto tempo. As etapas ligadas a uma etapa de produção aparecem dentro
 * dos projetos ("Como fazer esta etapa").
 */
import { normalizeText } from '../core/format.ts';
import { createId } from '../core/id.ts';
import type { ActionContext } from './operations.ts';
import { DEFAULT_PRODUCTION_STAGES } from './templates.ts';
import type { AppData, ID, Project, ProcessStep } from './types.ts';

/** Áreas na ordem do caminho do cliente. Áreas novas (digitadas) vão para o fim. */
export const PROCESS_AREAS = ['Prospecção', 'Negociação', 'Fechamento', 'Produção', 'Entrega e pós-venda', 'Rotina da equipe'];

const STARTER_AUTHOR = 'maria';
const STARTER_AT = '2026-11-23T12:00:00.000Z';

type Starter = Omit<ProcessStep, 'authorId' | 'updatedAt'>;

const STARTERS: Starter[] = [
  {
    id: 'proc_prosp_instagram',
    area: 'Prospecção',
    order: 1,
    title: 'Prospecção pelo Instagram',
    goal: 'Esquentar o lead antes de chamar, para a primeira mensagem não chegar fria.',
    owner: 'Maria',
    duration: '3 a 5 dias por lead',
    steps: [
      'Seguir uns 10 perfis do nicho escolhido por dia e cadastrar no Comercial com origem Instagram',
      'Dias 1 a 3: curtir 2 ou 3 posts recentes e reagir aos stories',
      'Comentar de verdade num post ou responder um story, sem oferta',
      'Quem seguir de volta está pronto para a primeira mensagem',
      'Mandar direct com saudação e um comentário real sobre o perfil',
      'Quando a conversa engatar, pedir o WhatsApp para mandar o áudio e a prévia',
    ],
    tips: 'Nada de oferta na primeira mensagem. O objetivo do direct é começar uma conversa, não vender.',
    stageName: null,
  },
  {
    id: 'proc_prosp_maps',
    area: 'Prospecção',
    order: 2,
    title: 'Google Maps e WhatsApp',
    goal: 'Abordar negócios sem site direto pelo WhatsApp, com uma prévia pronta.',
    owner: 'Maria',
    duration: 'No mesmo dia do cadastro',
    steps: [
      'Buscar no Google Maps negócios do nicho sem site, em cidades maiores (Blumenau, Gaspar, Itajaí)',
      'Cadastrar o lead no Comercial com origem Google Maps',
      'Primeira mensagem: só a saudação, perguntando se fala com o responsável',
      'Depois que responder: áudio de até 40 segundos explicando a ideia',
      'Logo abaixo do áudio, mandar o link da prévia ou do site da MaweCreate',
    ],
    tips: 'Não abrir com "preparamos algo, posso mandar um áudio?". Primeiro a pessoa responde, depois vem o áudio.',
    stageName: null,
  },
  {
    id: 'proc_prosp_indicacao',
    area: 'Prospecção',
    order: 3,
    title: 'Indicação',
    goal: 'Aproveitar a confiança de quem indicou.',
    owner: 'Maria',
    duration: 'Até 1 dia depois de receber o contato',
    steps: [
      'Cadastrar o lead com origem Indicação e anotar quem indicou',
      'Abrir a conversa citando quem indicou',
      'Depois que responder, seguir igual ao WhatsApp: áudio curto e prévia',
      'Agradecer quem indicou quando fechar',
    ],
    tips: 'Quem indica é cliente em potencial também. Vale mandar um obrigado mesmo se não fechar.',
    stageName: null,
  },
  {
    id: 'proc_followup',
    area: 'Prospecção',
    order: 4,
    title: 'Follow-up',
    goal: 'Lembrar o lead sem parecer insistente.',
    owner: 'Maria',
    duration: '3, 7 e 15 dias',
    steps: [
      'Sem resposta em 3 dias: follow-up 1',
      'Mais 7 dias: follow-up 2, com um motivo novo',
      'Mais 15 dias: follow-up 3, leve, deixando a prévia',
      'Sem resposta: mover para a etapa de pausados e tentar de novo em 3 meses',
    ],
    tips: 'No máximo 3 follow-ups. Cada um com um motivo novo, nunca só "e aí, viu?".',
    stageName: null,
  },
  {
    id: 'proc_entrada',
    area: 'Negociação',
    order: 1,
    title: 'Cliente que chega sozinho',
    goal: 'Responder rápido e levar o cliente até o briefing.',
    owner: 'Maria',
    duration: 'Responder no mesmo dia',
    steps: [
      'Responder no mesmo dia, agradecendo o contato',
      'Perguntar o nome do negócio, o que faz e o que precisa',
      'Mandar o site da MaweCreate com as demos',
      'Enviar o formulário de briefing',
      'Com o briefing respondido, montar a proposta',
    ],
    tips: 'Quem chama sozinho já está quente. Velocidade de resposta vale mais que texto perfeito.',
    stageName: null,
  },
  {
    id: 'proc_proposta',
    area: 'Negociação',
    order: 2,
    title: 'Briefing e proposta',
    goal: 'Entender o negócio e mandar uma proposta clara, já explicando o domínio.',
    owner: 'Maria',
    duration: 'Proposta em até 2 dias depois do briefing',
    steps: [
      'Mandar o formulário de briefing pelo WhatsApp',
      'Se não responder em 2 dias, lembrar com jeitinho',
      'Briefing chegou: registrar em Aprovações como "Briefing recebido"',
      'Montar a proposta em Comercial › Propostas e baixar o PDF',
      'Explicar o domínio na proposta: fica no nome do cliente e a taxa anual é paga no Registro.br',
      'Marcar a proposta como enviada e retomar em 3 dias se não responder',
    ],
    tips: 'Falar do domínio desde o começo evita a conversa difícil no final.',
    stageName: null,
  },
  {
    id: 'proc_fechamento',
    area: 'Fechamento',
    order: 1,
    title: 'Fechamento e pagamento',
    goal: 'Formalizar o combinado e começar com o pagamento confirmado.',
    owner: 'Maria',
    duration: 'No dia do aceite',
    steps: [
      'Cliente aceitou: registrar "Proposta aceita" em Aprovações, com o print',
      'Gerar o contrato em PDF pela proposta e mandar para o cliente',
      'Registrar "Contrato aceito" quando o cliente confirmar',
      'Marcar a proposta como aceita: o sistema cria o cliente, o projeto e as parcelas',
      'Cobrar via Pix e marcar a parcela como paga',
      'Pedir a lista de materiais: logo, fotos, textos e contatos',
    ],
    tips: 'Sem pagamento confirmado, a produção não começa.',
    stageName: null,
  },
  {
    id: 'proc_prod_briefing',
    area: 'Produção',
    order: 1,
    title: 'Coleta de materiais e alinhamento',
    goal: 'Juntar tudo antes de criar. O prazo de entrega só começa quando os materiais chegam.',
    owner: 'Maria',
    duration: 'Depende do cliente',
    steps: [
      'Logo em boa qualidade',
      'Fotos do negócio e dos produtos',
      'Textos e lista de serviços',
      'WhatsApp, endereço e redes sociais',
      'Domínio definido: o cliente registra ou a gente cadastra',
      'Quando tudo chegar, ajustar o prazo de entrega do projeto',
    ],
    tips: 'Muita agência perde prazo esperando foto e texto do cliente. Combine isso por escrito.',
    stageName: DEFAULT_PRODUCTION_STAGES[0],
  },
  {
    id: 'proc_prod_estrutura',
    area: 'Produção',
    order: 2,
    title: 'Referências e estrutura',
    goal: 'Decidir o caminho antes de abrir o editor.',
    owner: 'Maria',
    duration: '1 dia',
    steps: ['Juntar 3 referências do nicho', 'Definir as seções do site', 'Escrever o texto de cada seção', 'Revisar ortografia e tirar travessões'],
    tips: '',
    stageName: DEFAULT_PRODUCTION_STAGES[1],
  },
  {
    id: 'proc_prod_design',
    area: 'Produção',
    order: 3,
    title: 'Design',
    goal: 'Dar a cara do cliente ao site.',
    owner: 'Maria',
    duration: '1 a 2 dias',
    steps: ['Escolher cores e fontes a partir da identidade do cliente', 'Montar o visual da primeira dobra', 'Conferir se parece com o nicho (estética tem cara de estética)'],
    tips: '',
    stageName: DEFAULT_PRODUCTION_STAGES[2],
  },
  {
    id: 'proc_prod_dev',
    area: 'Produção',
    order: 4,
    title: 'Montagem do site',
    goal: 'Montar o site com o que foi decidido.',
    owner: 'Maria',
    duration: '2 a 4 dias',
    steps: ['Montar todas as seções', 'Ajustar para celular', 'Botão de WhatsApp com mensagem pronta', 'Revisão interna: links, celular, WhatsApp, telefone e erros de digitação'],
    tips: 'A revisão interna é feita por quem não montou. Bom momento para uma ajuda pontual do Wesley.',
    stageName: DEFAULT_PRODUCTION_STAGES[3],
  },
  {
    id: 'proc_prod_previa',
    area: 'Produção',
    order: 5,
    title: 'Prévia e ajustes com o cliente',
    goal: 'Mostrar, ajustar e ter a aprovação registrada.',
    owner: 'Maria',
    duration: 'Até 2 rodadas',
    steps: [
      'Mandar o link da prévia ao cliente',
      'Pedir todos os ajustes numa mensagem só',
      'Cada pedido de ajuste vira "Alteração solicitada" em Aprovações',
      'Quando o cliente aprovar, registrar "Prévia aprovada" com o print',
    ],
    tips: 'Estão incluídas 2 rodadas de alterações. Depois disso, ajuste extra é orçado à parte.',
    stageName: DEFAULT_PRODUCTION_STAGES[4],
  },
  {
    id: 'proc_prod_publicacao',
    area: 'Produção',
    order: 6,
    title: 'Publicação',
    goal: 'Colocar o site no ar com tudo quitado.',
    owner: 'Wesley',
    duration: 'No dia do pagamento',
    steps: ['Pagamento final confirmado', 'Domínio ligado ao site', 'Site no ar com cadeado (https)', 'Marcar o projeto como publicado'],
    tips: 'Ao marcar como publicado, o calendário de pós-venda do cliente começa a contar.',
    stageName: DEFAULT_PRODUCTION_STAGES[5],
  },
  {
    id: 'proc_entrega',
    area: 'Entrega e pós-venda',
    order: 1,
    title: 'Kit de entrega',
    goal: 'Entregar de um jeito que o cliente pense: essa agência sabe o que faz.',
    owner: 'Maria',
    duration: 'No dia da publicação',
    steps: [
      'Baixar o "Manual do site" em PDF pelo projeto e mandar ao cliente',
      'Gravar um vídeo de 2 a 3 minutos navegando pelo site (não precisa aparecer o rosto)',
      'Oferecer o plano de manutenção mensal',
      'Pedir o depoimento',
    ],
    tips: '',
    stageName: null,
  },
  {
    id: 'proc_posvenda',
    area: 'Entrega e pós-venda',
    order: 2,
    title: 'Pós-venda',
    goal: 'Manter contato para o cliente não sentir que a agência sumiu, e gerar indicação.',
    owner: 'Maria',
    duration: '7 dias, 30 dias e a cada 3 meses',
    steps: [
      '7 dias depois da entrega: perguntar se está tudo certo e pedir depoimento',
      '30 dias: ver se o site está trazendo contatos e oferecer extras',
      'A cada 3 meses: uma mensagem leve',
      'Um mês antes de vencer o domínio: avisar da renovação',
    ],
    tips: 'Os lembretes aparecem sozinhos no Foco de hoje e na ficha do cliente.',
    stageName: null,
  },
  {
    id: 'proc_rotina',
    area: 'Rotina da equipe',
    order: 1,
    title: 'Rotina e divisão do trabalho',
    goal: 'Manter os dois alinhados sem sobrecarregar ninguém.',
    owner: 'Maria e Wesley',
    duration: '20 minutos por noite',
    steps: [
      'Toda manhã: escrever as 3 prioridades do dia no Painel',
      'Maria cuida da operação: atendimento, prospecção, briefing e produção',
      'Wesley faz tarefas pontuais: hospedagem, domínio e revisão antes da entrega',
      'Toda noite, 20 minutos de alinhamento: o que aconteceu, o que travou e o que fazer amanhã',
      'Fim de semana é livre',
    ],
    tips: 'Quando entrar alguém novo na equipe, comece por este manual.',
    stageName: null,
  },
];

/** Manual inicial (ids fixos: os dois sócios geram exatamente o mesmo conteúdo). */
export function starterProcesses(authorId: ID = STARTER_AUTHOR): ProcessStep[] {
  return STARTERS.map((s) => ({ ...structuredClone(s), authorId, updatedAt: STARTER_AT }));
}

function areaIndex(area: string): number {
  const i = PROCESS_AREAS.indexOf(area);
  return i === -1 ? PROCESS_AREAS.length : i;
}

/** Processos na ordem do manual: por área (caminho do cliente) e pela ordem dentro dela. */
export function orderedProcesses(data: AppData): ProcessStep[] {
  return [...(data.processes ?? [])].sort(
    (a, b) => areaIndex(a.area) - areaIndex(b.area) || a.area.localeCompare(b.area) || a.order - b.order || a.title.localeCompare(b.title),
  );
}

/** Áreas usadas, na ordem do manual. */
export function processAreas(data: AppData): string[] {
  return [...new Set(orderedProcesses(data).map((p) => p.area))];
}

/** Processo ligado a uma etapa de produção (compara o nome sem acentos e sem maiúsculas). */
export function processForStage(data: AppData, stageName: string): ProcessStep | undefined {
  const key = normalizeText(stageName);
  return (data.processes ?? []).find((p) => p.stageName && normalizeText(p.stageName) === key);
}

/** Etapa em que o projeto está agora (a primeira que não foi concluída). */
export function currentStageOf(project: Project): Project['stages'][number] | undefined {
  return project.stages.find((s) => s.status !== 'concluida');
}

export type ProcessInput = Pick<ProcessStep, 'area' | 'title' | 'goal' | 'owner' | 'duration' | 'steps' | 'tips' | 'stageName'> & { order?: number | null };

export function saveProcess(draft: AppData, id: ID | null, input: ProcessInput, ctx: ActionContext): ProcessStep {
  const title = input.title.trim();
  if (!title) throw new Error('Dê um nome para a etapa.');
  const area = input.area.trim() || 'Outros';
  const steps = input.steps.map((s) => s.trim()).filter(Boolean);
  draft.processes ??= [];
  const base = {
    area,
    title,
    goal: input.goal.trim(),
    owner: input.owner.trim(),
    duration: input.duration.trim(),
    steps,
    tips: input.tips.trim(),
    stageName: input.stageName?.trim() || null,
    authorId: ctx.userId,
    updatedAt: ctx.now.toISOString(),
  };
  if (id) {
    const current = draft.processes.find((p) => p.id === id);
    if (!current) throw new Error('Etapa do processo não encontrada.');
    Object.assign(current, base, { order: input.order ?? current.order });
    return current;
  }
  const sameArea = draft.processes.filter((p) => p.area === area);
  const order = input.order ?? (sameArea.length ? Math.max(...sameArea.map((p) => p.order)) + 1 : 1);
  const created: ProcessStep = { id: createId('proc'), order, ...base };
  draft.processes.push(created);
  return created;
}

export function deleteProcess(draft: AppData, id: ID): void {
  draft.processes = (draft.processes ?? []).filter((p) => p.id !== id);
}

/** Sobe ou desce uma etapa dentro da própria área. */
export function moveProcess(draft: AppData, id: ID, direction: -1 | 1): void {
  const list = (draft.processes ?? []).filter((p) => p.area === (draft.processes ?? []).find((x) => x.id === id)?.area).sort((a, b) => a.order - b.order);
  const index = list.findIndex((p) => p.id === id);
  const other = list[index + direction];
  if (index === -1 || !other) return;
  // Renumera a área inteira para não haver empates.
  list.forEach((p, i) => (p.order = i + 1));
  const a = list[index];
  [a.order, other.order] = [other.order, a.order];
}
