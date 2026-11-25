/**
 * Mensagens prontas com opções: cada mensagem tem até 3 versões (Opção 1, 2 e 3),
 * um grupo (Por situação, Follow-up, Objeções, Precificação) e, quando faz
 * sentido, o momento em que o sistema sugere a mensagem sozinho (primeira
 * mensagem, cada follow-up, cliente que sumiu depois da prévia...).
 */
import { normalizeText } from '../core/format.ts';
import { fillTemplate } from './commercial.ts';
import type { AppData, LibraryItem, MessageGroup, MessageStep } from './types.ts';

export const MESSAGE_GROUPS: Array<{ value: MessageGroup; label: string }> = [
  { value: 'situacao', label: 'Por situação' },
  { value: 'followup', label: 'Follow-up' },
  { value: 'objecoes', label: 'Objeções' },
  { value: 'precificacao', label: 'Precificação' },
];

export const MESSAGE_STEPS: Array<{ value: MessageStep; label: string; group: MessageGroup }> = [
  { value: 'abordagem', label: 'Primeira mensagem', group: 'followup' },
  { value: 'followup_1', label: '1º follow-up', group: 'followup' },
  { value: 'followup_2', label: '2º follow-up', group: 'followup' },
  { value: 'followup_3', label: '3º follow-up', group: 'followup' },
  { value: 'encerramento', label: 'Encerramento', group: 'followup' },
  { value: 'tentar', label: 'Tentar de novo (3 meses depois)', group: 'followup' },
  { value: 'previa_sumiu', label: 'Cliente sumiu depois da prévia', group: 'situacao' },
  { value: 'pagamento_final', label: 'Cobrar o pagamento final', group: 'precificacao' },
  { value: 'extra', label: 'Cobrar arte ou ajuste extra', group: 'precificacao' },
  { value: 'depoimento', label: 'Pedir depoimento', group: 'situacao' },
];

/** Máximo de versões de uma mensagem (Opção 1, 2 e 3). */
export const MAX_OPTIONS = 3;

export function groupLabel(group: MessageGroup | null | undefined): string {
  return MESSAGE_GROUPS.find((g) => g.value === group)?.label ?? 'Por situação';
}

export function stepLabel(step: MessageStep | null | undefined, cadence: readonly number[] = []): string {
  const meta = MESSAGE_STEPS.find((s) => s.value === step);
  if (!meta) return '';
  const n = step === 'followup_1' ? 0 : step === 'followup_2' ? 1 : step === 'followup_3' ? 2 : -1;
  return n >= 0 && cadence[n] ? `${meta.label} · dia ${cadence[n]}` : meta.label;
}

/** As versões preenchidas da mensagem, na ordem (a primeira é sempre o `content`). */
export function messageOptions(item: Pick<LibraryItem, 'content' | 'options'>): string[] {
  return [item.content, ...(item.options ?? [])].map((t) => t ?? '').filter((t, i) => i === 0 || t.trim()).slice(0, MAX_OPTIONS);
}

/** Ordem dos passos dentro do Follow-up (para a régua aparecer na ordem dos dias). */
export function stepOrder(step: MessageStep | null | undefined): number {
  const i = MESSAGE_STEPS.findIndex((s) => s.value === step);
  return i < 0 ? 99 : i;
}

/** A mensagem que o sistema sugere para um momento (a mais recente, se houver mais de uma). */
export function messageForStep(data: Pick<AppData, 'library'>, step: MessageStep): LibraryItem | undefined {
  return data.library
    .filter((l) => l.step === step)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

/** Os dias da régua de follow-up configurada no funil (etapa Aguardando resposta). */
export function followUpCadence(data: Pick<AppData, 'pipelineStages'>): number[] {
  return data.pipelineStages.find((s) => s.id === 'aguardando')?.cadence ?? [3, 7, 15];
}

/** Qual mensagem mandar para um lead, pelo que ele precisa hoje. */
export function stepForLead(input: { stage: string; attempts: number }): MessageStep {
  if (input.stage === 'sem_resposta') return 'tentar';
  if (input.stage === 'aquecimento' || input.stage === 'abordar') return input.attempts ? 'tentar' : 'abordagem';
  if (input.attempts <= 1) return 'followup_1';
  if (input.attempts === 2) return 'followup_2';
  if (input.attempts === 3) return 'followup_3';
  return 'encerramento';
}

/**
 * Troca os campos da mensagem pelo que está no cadastro: {{nome}}, {{empresa}},
 * {{meu_nome}}, {{valor}} e {{pix}}. Campos sem valor continuam marcados para
 * a pessoa completar.
 */
export function fillMessage(text: string, values: { company: string; contact: string; me: string; amount?: string; pix?: string }): string {
  const first = values.contact.trim().split(/\s+/)[0] || values.company;
  const fields: Record<string, string | undefined> = { nome: first, contato: first, empresa: values.company, meu_nome: values.me, valor: values.amount, pix: values.pix };
  const filled = text.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, key: string) => fields[key.toLowerCase()] || all);
  return fillTemplate(filled, values);
}

// ---------------------------------------------------------------- Organização das mensagens antigas

/** Grupo provável de uma mensagem antiga, pelo título e pelo resumo. */
export function guessGroup(item: Pick<LibraryItem, 'title' | 'summary'>): MessageGroup {
  const t = normalizeText(`${item.title} ${item.summary}`);
  if (/follow|retorno|cobrar resposta|sem resposta|lembrete|ultima tentativa|encerr/.test(t)) return 'followup';
  if (/objec|caro|pensar|depois|nao tenho|ja tenho|sem dinheiro|desconto|concorr|insta(gram)? basta|nao preciso/.test(t)) return 'objecoes';
  if (/preco|valor|orcament|pagamento|parcel|pix|cobran|investimento|pacote/.test(t)) return 'precificacao';
  return 'situacao';
}

/** Momento provável de uma mensagem antiga (só quando o título deixa claro). */
export function guessStep(item: Pick<LibraryItem, 'title'>): MessageStep | null {
  const t = normalizeText(item.title);
  if (/primeir[ao] (mensagem|contato|abordagem)|^abordagem/.test(t)) return 'abordagem';
  if (/(1|primeiro)[oº°]? ?follow|follow[ -]?up ?(1|um)\b/.test(t)) return 'followup_1';
  if (/(2|segundo)[oº°]? ?follow|follow[ -]?up ?(2|dois)\b/.test(t)) return 'followup_2';
  if (/(3|terceiro)[oº°]? ?follow|follow[ -]?up ?(3|tres)\b/.test(t)) return 'followup_3';
  if (/ultima tentativa|encerramento|despedida/.test(t)) return 'encerramento';
  return null;
}

/**
 * Ajuste único: dá grupo às mensagens que já existem (sem mudar o texto),
 * marca o momento das que deixam claro no título e acrescenta as mensagens
 * que faltam para os momentos novos. Ids fixos: os dois sócios geram o mesmo.
 */
export function organizeMessages(d: AppData): void {
  for (const item of d.library) {
    if (item.category !== 'mensagem') continue;
    if (!item.group) item.group = guessGroup(item);
    if (item.step === undefined) {
      const step = guessStep(item);
      item.step = step && !d.library.some((l) => l !== item && l.step === step) ? step : null;
      if (item.step) item.group = 'followup';
    }
    if (!Array.isArray(item.options)) item.options = [];
  }
  const author = d.users.some((u) => u.id === 'maria') ? 'maria' : (d.users[0]?.id ?? 'maria');
  for (const m of STARTER_MESSAGES) {
    if (d.library.some((l) => l.id === m.id || (m.step && l.step === m.step))) continue;
    d.library.push({ ...structuredClone(m), authorId: author, updatedAt: '2026-11-25T12:00:00.000Z', ...(d.meta.dataset === 'demo' ? { isDemo: true } : {}) });
  }
}

type Starter = Omit<LibraryItem, 'authorId' | 'updatedAt'>;

export const STARTER_MESSAGES: Starter[] = [
  {
    id: 'lib_abordagem',
    category: 'mensagem',
    group: 'followup',
    step: 'abordagem',
    title: 'Primeira mensagem',
    summary: 'Depois do aquecimento no Instagram. Curta, sem vender de cara.',
    content: 'Oi, {{nome}}, tudo bem? Sou a {{meu_nome}}, da MaweCreate. Acompanho a {{empresa}} no Instagram e adoro o trabalho de vocês!\n\nVi que vocês ainda não têm um site. Posso te mostrar em 2 minutinhos como um site simples pode trazer clientes pelo Google?',
    options: [
      'Oi, {{nome}}! Aqui é a {{meu_nome}}, da MaweCreate 😊 Pesquisei {{empresa}} no Google e quase não aparece nada de vocês por lá. Quem procura no Google já está querendo contratar. Posso te mandar um exemplo de site que fizemos para um negócio parecido?',
      'Oi, {{nome}}, tudo bem? Faço sites para negócios aqui da região e montei uma ideia rápida de como ficaria o da {{empresa}}. Posso te mandar para você dar uma olhada? Sem compromisso nenhum.',
    ],
  },
  {
    id: 'lib_followup_1',
    category: 'mensagem',
    group: 'followup',
    step: 'followup_1',
    title: '1º follow-up',
    summary: 'Primeiro lembrete, leve.',
    content: 'Oi, {{nome}}! Passando aqui de novo, porque sei que a rotina é corrida 😊 Conseguiu ver minha mensagem sobre o site da {{empresa}}?',
    options: ['Oi, {{nome}}! Só para não se perder no meio das mensagens: posso te mandar o exemplo de site que comentei? Leva 1 minutinho para ver.'],
  },
  {
    id: 'lib_followup_2',
    category: 'mensagem',
    group: 'followup',
    step: 'followup_2',
    title: '2º follow-up',
    summary: 'Traz um motivo novo para responder (exemplo ou resultado).',
    content: 'Oi, {{nome}}! Terminamos esta semana um site para um negócio parecido com a {{empresa}} e ficou lindo. Quer ver como ficou? Acho que você ia gostar.',
    options: ['Oi, {{nome}}! Uma dica rápida: quem pesquisa no Google já quer contratar, e quem não tem site nem entra na disputa. Se quiser, te mostro em 2 minutos como seria o site da {{empresa}}.'],
  },
  {
    id: 'lib_followup_3',
    category: 'mensagem',
    group: 'followup',
    step: 'followup_3',
    title: '3º follow-up',
    summary: 'Pergunta direta, fácil de responder com sim ou não.',
    content: 'Oi, {{nome}}! Ter um site agora faz sentido para a {{empresa}} ou é melhor eu te procurar mais para frente? Qualquer resposta me ajuda 😊',
  },
  {
    id: 'lib_encerramento',
    category: 'mensagem',
    group: 'followup',
    step: 'encerramento',
    title: 'Encerramento',
    summary: 'Última mensagem, deixando a porta aberta.',
    content: 'Oi, {{nome}}! Como não tive retorno, vou parar de te mandar mensagem por aqui, tá? Se um dia quiser um site para a {{empresa}}, é só me chamar. Sucesso para vocês! 💕',
  },
  {
    id: 'lib_tentar',
    category: 'mensagem',
    group: 'followup',
    step: 'tentar',
    title: 'Tentar de novo (3 meses depois)',
    summary: 'Nova abordagem para quem não respondeu da primeira vez.',
    content: 'Oi, {{nome}}, tudo bem? Falamos uns meses atrás sobre um site para a {{empresa}}. Estamos com agenda aberta este mês. Ainda faz sentido para vocês?',
  },
  {
    id: 'lib_previa_sumiu',
    category: 'mensagem',
    group: 'situacao',
    step: 'previa_sumiu',
    title: 'Cliente sumiu depois da prévia',
    summary: 'A prévia foi enviada e o cliente não respondeu.',
    content: 'Oi, {{nome}}, tudo bem? Sei que a semana tá corrida! Quando tiver um tempinho, dá uma olhada na prévia do site que te mandei. Se quiser, posso te ligar rapidinho e te mostrar tudo, é bem rápido 😊',
    options: [
      'Oi, {{nome}}, tudo bem? Queria deixar o site da {{empresa}} no ar o quanto antes para você já aproveitar. Conseguiu ver a prévia? Se tiver algo para mudar, me fala que eu ajusto. Se estiver tudo certo, já sigo para a publicação 😊',
    ],
  },
  {
    id: 'lib_pagamento_final',
    category: 'mensagem',
    group: 'precificacao',
    step: 'pagamento_final',
    title: 'Pagamento final antes de publicar',
    summary: 'O cliente aprovou: falta a segunda parte do pagamento.',
    content: 'Oi, {{nome}}! Que bom que você aprovou o site da {{empresa}} 🎉 Para eu publicar, falta só a segunda parte do pagamento, {{valor}}. Pode ser no Pix: {{pix}}. Assim que cair, coloco o site no ar e te mando o manual.',
  },
  {
    id: 'lib_extra',
    category: 'mensagem',
    group: 'precificacao',
    step: 'extra',
    title: 'Ajuste ou arte além do pacote',
    summary: 'Quando o cliente pede mais do que está incluído.',
    content: 'Oi, {{nome}}! Anotei os novos ajustes 😊 Só te aviso que as rodadas de ajuste do pacote já foram usadas, então essa rodada extra fica {{valor}}. Posso seguir?',
    options: ['Oi, {{nome}}! Claro, faço sim 😊 As artes do pacote já foram entregues, então cada arte nova fica {{valor}}. Quer que eu siga com ela?'],
  },
  {
    id: 'lib_depoimento',
    category: 'mensagem',
    group: 'situacao',
    step: 'depoimento',
    title: 'Pedido de depoimento',
    summary: 'Depois da entrega, para usar no Instagram e no portfólio.',
    content: 'Oi, {{nome}}! Foi muito bom fazer o site da {{empresa}} 💕 Você pode me mandar um áudio ou uma mensagem curtinha contando como foi trabalhar com a gente? Ajuda muito uma agência que está crescendo!',
    options: ['Oi, {{nome}}! Se você gostou do resultado, deixa uma avaliação para a MaweCreate no Google? Leva 1 minutinho e ajuda muito outras pessoas a nos encontrarem 😊'],
  },
];
