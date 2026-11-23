/**
 * Documentos com a marca da agência: proposta, contrato, manual do site
 * (entregue ao cliente) e manual de processos (para a equipe).
 *
 * Aqui só se monta o conteúdo em blocos (título, parágrafo, lista, tabela...).
 * A tela transforma os blocos em uma página pronta para "Salvar como PDF".
 */
import { formatLongDate, type ISODate } from '../core/dates.ts';
import { formatCurrency } from '../core/format.ts';
import { agencyOf } from './daily.ts';
import { orderedProcesses } from './processes.ts';
import { proposalRecipient, proposalTotals, serviceIncludes } from './business.ts';
import type { AppData, Project, Proposal } from './types.ts';

export type DocBlock =
  | { t: 'title'; text: string }
  | { t: 'subtitle'; text: string }
  | { t: 'heading'; text: string }
  | { t: 'paragraph'; text: string }
  | { t: 'list'; items: string[]; ordered?: boolean }
  | { t: 'table'; rows: Array<[string, string]> }
  | { t: 'total'; label: string; value: string }
  | { t: 'note'; text: string }
  | { t: 'signatures'; names: string[] };

export interface AgencyDocument {
  /** Nome sugerido para o arquivo PDF. */
  fileName: string;
  blocks: DocBlock[];
}

const money = (n: number) => formatCurrency(n, true);

function slug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function recipientPerson(data: AppData, p: Proposal): string {
  if (p.clientId) return data.clients.find((c) => c.id === p.clientId)?.contactName ?? '';
  if (p.opportunityId) return data.opportunities.find((o) => o.id === p.opportunityId)?.contactName ?? '';
  return '';
}

function paymentText(data: AppData, p: Proposal): string {
  const agency = agencyOf(data);
  const terms = p.paymentTerms || agency.paymentTerms;
  const pix = agency.pix ? ` Chave Pix: ${agency.pix}.` : '';
  return `${terms.replace(/\.?\s*$/, '.')}${pix}`;
}

const DOMAIN_TEXT =
  'O domínio é o endereço do site (por exemplo, seunegocio.com.br). Ele fica no seu nome, então é seu para sempre, mesmo se um dia trocar de agência. A taxa anual é paga direto no Registro.br. Você pode registrar com o nosso passo a passo, ou a gente cuida do cadastro por uma taxa de serviço.';

// ---------------------------------------------------------------- Proposta

export function proposalDocument(data: AppData, p: Proposal, today: ISODate): AgencyDocument {
  const agency = agencyOf(data);
  const to = proposalRecipient(data, p);
  const person = recipientPerson(data, p);
  const totals = proposalTotals(p);
  const blocks: DocBlock[] = [
    { t: 'title', text: 'Proposta comercial' },
    { t: 'subtitle', text: [`Para ${to}`, person && `aos cuidados de ${person}`, `${agency.city}, ${formatLongDate(p.sentAt ?? today)}`].filter(Boolean).join(' · ') },
    { t: 'heading', text: 'O que vamos fazer' },
  ];
  for (const item of p.items) {
    const service = item.serviceId ? data.services.find((s) => s.id === item.serviceId) : undefined;
    const includes = service ? serviceIncludes(service) : [];
    blocks.push({ t: 'paragraph', text: `${item.quantity > 1 ? `${item.quantity} × ` : ''}${item.name}` });
    if (includes.length) blocks.push({ t: 'list', items: includes });
  }
  if (p.contract?.scope) blocks.push({ t: 'paragraph', text: `Seções ou páginas previstas: ${p.contract.scope}.` });
  blocks.push(
    { t: 'heading', text: 'Investimento' },
    {
      t: 'table',
      rows: p.items.map((i) => [`${i.quantity > 1 ? `${i.quantity} × ` : ''}${i.name}`, `${money(i.price * i.quantity)}${i.billing === 'mensal' ? '/mês' : ''}`]),
    },
  );
  if (totals.oneTime) blocks.push({ t: 'total', label: 'Total', value: money(totals.oneTime) });
  if (totals.monthly) blocks.push({ t: 'total', label: 'Mensalidade', value: `${money(totals.monthly)}/mês` });
  blocks.push({ t: 'paragraph', text: `Pagamento: ${paymentText(data, p)}` });
  const days = p.contract?.deliveryDays ?? Math.max(0, ...p.items.map((i) => data.services.find((s) => s.id === i.serviceId)?.deliveryDays ?? 0));
  if (days) {
    blocks.push(
      { t: 'heading', text: 'Prazo' },
      { t: 'paragraph', text: `${days} dias úteis, contados a partir do recebimento de todos os materiais (logo, fotos, textos e respostas do briefing) e da confirmação do pagamento.` },
    );
  }
  blocks.push(
    { t: 'heading', text: 'O que está incluso' },
    { t: 'list', items: ['Design sob medida a partir da identidade do seu negócio', 'Versão pensada para o celular', 'Botão de WhatsApp com mensagem pronta', 'Até 2 rodadas de alterações sobre a prévia', 'Publicação do site e orientação sobre o domínio', 'Manual do site em PDF na entrega'] },
    { t: 'heading', text: 'Sobre o domínio' },
    { t: 'paragraph', text: DOMAIN_TEXT },
  );
  if (p.notes) blocks.push({ t: 'heading', text: 'Observações' }, { t: 'paragraph', text: p.notes });
  blocks.push(
    { t: 'heading', text: 'Próximos passos' },
    {
      t: 'list',
      ordered: true,
      items: [
        'Você aprova esta proposta por escrito (pode ser pelo WhatsApp)',
        'Enviamos o formulário de briefing e a lista de materiais',
        'Com os materiais em mãos e o pagamento confirmado, começamos a produção',
        'Você recebe a prévia, pede os ajustes e aprova',
        'Publicamos o site e entregamos o manual',
      ],
    },
    { t: 'note', text: [p.validUntil ? `Proposta válida até ${formatLongDate(p.validUntil)}.` : '', 'Atendimento 100% online.', contactLine(data)].filter(Boolean).join(' ') },
  );
  return { fileName: `proposta-${slug(to)}`, blocks };
}

function contactLine(data: AppData): string {
  const a = agencyOf(data);
  return [a.name, a.whatsapp, a.email, a.instagram, a.website].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- Contrato

/** O que falta preencher para o contrato ficar completo (aparece como aviso). */
export function contractGaps(data: AppData, p: Proposal): string[] {
  const a = agencyOf(data);
  const gaps: string[] = [];
  if (!a.responsible) gaps.push('nome do responsável da agência (Sistema › Dados da agência)');
  if (!a.document) gaps.push('CPF ou CNPJ da agência (Sistema › Dados da agência)');
  if (!p.contract?.clientDocument) gaps.push('CPF ou CNPJ do cliente');
  return gaps;
}

export function contractDocument(data: AppData, p: Proposal, today: ISODate): AgencyDocument {
  const a = agencyOf(data);
  const c = p.contract;
  const to = proposalRecipient(data, p);
  const person = recipientPerson(data, p);
  const totals = proposalTotals(p);
  const services = p.items.map((i) => `${i.quantity > 1 ? `${i.quantity} × ` : ''}${i.name}`).join(', ');
  const days = c?.deliveryDays ?? Math.max(0, ...p.items.map((i) => data.services.find((s) => s.id === i.serviceId)?.deliveryDays ?? 0));
  const blank = '________________';
  const clauses: Array<[string, string]> = [
    ['1. Objeto', `A CONTRATADA vai prestar à CONTRATANTE os seguintes serviços: ${services}.${c?.scope ? ` O site terá: ${c.scope}.` : ''}`],
    [
      '2. Prazo',
      `${days ? `A entrega será feita em até ${days} dias úteis` : 'O prazo de entrega é o combinado na proposta'}, contados a partir do recebimento de todos os materiais (logo, fotos, textos e respostas do briefing) e da confirmação do pagamento. Atrasos no envio de materiais ou nas respostas da CONTRATANTE prorrogam o prazo pelo mesmo período.`,
    ],
    [
      '3. Valor e pagamento',
      `${totals.oneTime ? `O valor total é de ${money(totals.oneTime)}. ` : ''}${totals.monthly ? `A mensalidade é de ${money(totals.monthly)}. ` : ''}${paymentText(data, p)} O site só é publicado depois que o valor total estiver pago.`,
    ],
    ['4. Alterações', 'Estão incluídas até 2 rodadas de alterações sobre a prévia. Cada rodada deve reunir todos os ajustes em uma única mensagem. Alterações além disso, ou mudanças no que foi combinado, serão orçadas à parte.'],
    ['5. Aprovação', 'A aprovação da prévia e da entrega pode ser feita por escrito no WhatsApp, no Instagram ou por e-mail, e vale como aceite.'],
    ['6. Domínio e hospedagem', `O domínio é registrado em nome da CONTRATANTE, que paga a taxa anual direto ao Registro.br. A CONTRATADA orienta o registro e faz a publicação. ${a.hostingNote}`],
    ['7. Manutenção', 'A manutenção mensal não está incluída, a não ser que esteja listada no objeto deste contrato. Planos de manutenção são contratados à parte e podem ser cancelados com aviso de 30 dias.'],
    ['8. Cancelamento e reembolso', 'Se a CONTRATANTE desistir antes do início do planejamento, o valor pago é devolvido. Depois que o planejamento começa, o valor pago não é devolvido.'],
    ['9. Materiais e conteúdo', 'A CONTRATANTE é responsável pelos textos, fotos e marcas que enviar, e garante que tem direito de usá-los.'],
    ['10. Uso no portfólio', 'Depois de quitado, o site é da CONTRATANTE. A CONTRATADA pode mostrar o trabalho no portfólio e nas redes sociais, salvo pedido contrário por escrito.'],
    ['11. Foro', `As partes elegem o foro da comarca de ${a.city || blank} para resolver qualquer questão deste contrato.`],
  ];
  const blocks: DocBlock[] = [
    { t: 'title', text: 'Contrato de prestação de serviços' },
    { t: 'subtitle', text: `${services} · ${to}` },
    { t: 'heading', text: 'As partes' },
    {
      t: 'paragraph',
      text: `CONTRATADA: ${a.name}, representada por ${a.responsible || blank}, inscrita no CPF/CNPJ ${a.document || blank}, com atendimento 100% online.`,
    },
    {
      t: 'paragraph',
      text: `CONTRATANTE: ${to}${person ? `, representada por ${person}` : ''}, inscrita no CPF/CNPJ ${c?.clientDocument || blank}${c?.clientAddress ? `, com endereço em ${c.clientAddress}` : ''}.`,
    },
  ];
  for (const [h, text] of clauses) blocks.push({ t: 'heading', text: h }, { t: 'paragraph', text });
  if (p.notes) blocks.push({ t: 'heading', text: '12. Observações' }, { t: 'paragraph', text: p.notes });
  blocks.push(
    { t: 'paragraph', text: `E por estarem de acordo, as partes aceitam este contrato. ${a.city ? `${a.city}, ` : ''}${formatLongDate(p.startDate ?? today)}.` },
    { t: 'signatures', names: [`${a.name}${a.responsible ? ` · ${a.responsible}` : ''}`, `${to}${person ? ` · ${person}` : ''}`] },
  );
  return { fileName: `contrato-${slug(to)}`, blocks };
}

// ---------------------------------------------------------------- Manual do site

export function siteManualDocument(data: AppData, project: Project, today: ISODate): AgencyDocument {
  const a = agencyOf(data);
  const client = data.clients.find((c) => c.id === project.clientId);
  const hasPlan = (client?.subscriptions ?? []).some((s) => s.active);
  const blocks: DocBlock[] = [
    { t: 'title', text: 'Manual do seu site' },
    { t: 'subtitle', text: `${client?.company ?? project.name} · entregue em ${formatLongDate(project.publishedAt ?? today)}` },
    { t: 'heading', text: 'Seu site está no ar' },
    { t: 'paragraph', text: `Endereço: ${project.links.production || '(coloque o link do site no projeto)'}` },
  ];
  if (project.description) blocks.push({ t: 'heading', text: 'O que tem no seu site' }, { t: 'paragraph', text: project.description });
  blocks.push(
    { t: 'heading', text: 'Como divulgar' },
    {
      t: 'list',
      items: [
        'Coloque o link na bio do Instagram',
        'Use o link no status e na mensagem automática do WhatsApp Business',
        'Cadastre o site no seu perfil do Google Meu Negócio',
        'Mande o link para clientes antigos junto com uma novidade',
        'Imprima um QR Code do site para o balcão, o cardápio ou o cartão',
      ],
    },
    { t: 'heading', text: 'Como pedir alterações' },
    {
      t: 'paragraph',
      text: `Chame a gente no WhatsApp${a.whatsapp ? ` ${a.whatsapp}` : ''}. Mande tudo o que quer mudar numa mensagem só, com prints se puder. ${hasPlan ? 'Seu plano de manutenção cobre os ajustes combinados.' : 'Ajustes avulsos são orçados na hora, ou você pode assinar um plano de manutenção mensal.'}`,
    },
    { t: 'heading', text: 'Domínio' },
    {
      t: 'paragraph',
      text: `${client?.domain?.name ? `Seu domínio é ${client.domain.name}. ` : ''}${client?.domain?.renewsOn ? `Ele vence em ${formatLongDate(client.domain.renewsOn)}, e a gente avisa um mês antes. ` : ''}O domínio está no seu nome e a renovação é anual, paga direto no Registro.br. Se ele vencer, o site sai do ar.`,
    },
    { t: 'heading', text: 'Fale com a gente' },
    { t: 'paragraph', text: contactLine(data) },
    { t: 'note', text: `Obrigado pela confiança. ${a.name}` },
  );
  return { fileName: `manual-do-site-${slug(client?.company ?? project.name)}`, blocks };
}

// ---------------------------------------------------------------- Manual de processos

export function processManualDocument(data: AppData, today: ISODate): AgencyDocument {
  const a = agencyOf(data);
  const blocks: DocBlock[] = [
    { t: 'title', text: 'Manual de processos' },
    { t: 'subtitle', text: `${a.name} · atualizado em ${formatLongDate(today)}` },
  ];
  let area = '';
  let n = 0;
  for (const p of orderedProcesses(data)) {
    if (p.area !== area) {
      area = p.area;
      blocks.push({ t: 'heading', text: area });
    }
    n++;
    blocks.push({ t: 'paragraph', text: `${n}. ${p.title}${p.goal ? `: ${p.goal}` : ''}` });
    const info: Array<[string, string]> = [];
    if (p.owner) info.push(['Quem faz', p.owner]);
    if (p.duration) info.push(['Tempo', p.duration]);
    if (info.length) blocks.push({ t: 'table', rows: info });
    if (p.steps.length) blocks.push({ t: 'list', items: p.steps, ordered: true });
    if (p.tips) blocks.push({ t: 'note', text: `Dica: ${p.tips}` });
  }
  return { fileName: `manual-de-processos-${slug(a.name)}`, blocks };
}

/** Versão em texto simples (para copiar e colar no WhatsApp ou e-mail). */
export function documentText(doc: AgencyDocument): string {
  return doc.blocks
    .map((b) => {
      switch (b.t) {
        case 'title':
          return b.text.toUpperCase();
        case 'heading':
          return `\n${b.text.toUpperCase()}`;
        case 'list':
          return b.items.map((item, i) => `${b.ordered ? `${i + 1}.` : '•'} ${item}`).join('\n');
        case 'table':
          return b.rows.map(([k, v]) => `${k}: ${v}`).join('\n');
        case 'total':
          return `${b.label}: ${b.value}`;
        case 'signatures':
          return `\n${b.names.map((n) => `____________________________\n${n}`).join('\n\n')}`;
        default:
          return b.text;
      }
    })
    .join('\n');
}
