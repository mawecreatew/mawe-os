/**
 * Regras das áreas de Calendário de conteúdo, Tráfego pago, Serviços e preços,
 * Propostas e Metas. Funções puras sobre o rascunho (`draft`), como em
 * `operations.ts`.
 */
import { addDays, diffInDays, isValidISODate, lastDayOfMonth, monthKey, parseISODate, type ISODate, type MonthKey } from '../core/dates.ts';
import { createId } from '../core/id.ts';
import { monthRevenue } from './finance.ts';
import { PAYMENT_TERMS, projectTypeForCategory } from './labels.ts';
import { addInstallment, convertOpportunityToClient, createProject, type ActionContext } from './operations.ts';
import type {
  AppData,
  Campaign,
  ContentItem,
  ContentStatus,
  ID,
  MonthlyGoals,
  Project,
  Proposal,
  ProposalItem,
  ProposalStatus,
  Service,
} from './types.ts';

function mustFind<T extends { id: ID }>(list: T[], id: ID, what: string): T {
  const item = list.find((x) => x.id === id);
  if (!item) throw new Error(`${what} não encontrado(a).`);
  return item;
}

function cleanUrl(value: string): string {
  const v = value.trim();
  if (!v) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    if (!url.hostname.includes('.')) throw new Error();
    return v;
  } catch {
    throw new Error(`O link "${v}" não parece válido.`);
  }
}

// ---------------------------------------------------------------- Calendário de conteúdo

export type ContentInput = Pick<
  ContentItem,
  'title' | 'clientId' | 'projectId' | 'date' | 'time' | 'network' | 'format' | 'caption' | 'artLink' | 'notes' | 'status'
>;

export function saveContent(draft: AppData, id: ID | null, input: ContentInput, ctx: ActionContext): ContentItem {
  const title = input.title.trim();
  if (!title) throw new Error('Dê um tema para o conteúdo.');
  if (!isValidISODate(input.date)) throw new Error('Informe a data do conteúdo.');
  if (input.time && !/^\d{2}:\d{2}$/.test(input.time)) throw new Error('Horário inválido.');
  if (input.clientId && !draft.clients.some((c) => c.id === input.clientId)) throw new Error('Cliente não encontrado.');
  let projectId = input.projectId;
  if (projectId) {
    const project = mustFind(draft.projects, projectId, 'Projeto');
    if (project.clientId !== input.clientId) projectId = null; // projeto de outro cliente: não liga
  }
  const clean = { ...input, title, projectId, artLink: cleanUrl(input.artLink), caption: input.caption.trim(), notes: input.notes.trim() };
  if (id) {
    const item = mustFind(draft.contents, id, 'Conteúdo');
    Object.assign(item, clean);
    return item;
  }
  const item: ContentItem = { id: createId('cnt'), ...clean, createdAt: ctx.now.toISOString() };
  draft.contents.push(item);
  return item;
}

export function setContentStatus(draft: AppData, id: ID, status: ContentStatus): void {
  mustFind(draft.contents, id, 'Conteúdo').status = status;
}

export function moveContent(draft: AppData, id: ID, date: ISODate): void {
  if (!isValidISODate(date)) throw new Error('Data inválida.');
  mustFind(draft.contents, id, 'Conteúdo').date = date;
}

export function deleteContent(draft: AppData, id: ID): void {
  mustFind(draft.contents, id, 'Conteúdo');
  draft.contents = draft.contents.filter((c) => c.id !== id);
}

/** Valor usado no filtro para a própria agência. */
export const AGENCY_FILTER = 'mawe';

export function contentsInRange(data: AppData, from: ISODate, to: ISODate, client: string = 'todos'): ContentItem[] {
  return data.contents
    .filter((c) => c.date >= from && c.date <= to)
    .filter((c) => (client === 'todos' ? true : client === AGENCY_FILTER ? c.clientId === null : c.clientId === client))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '99').localeCompare(b.time || '99'));
}

export function contentsOfProject(data: AppData, projectId: ID): ContentItem[] {
  return data.contents.filter((c) => c.projectId === projectId).sort((a, b) => a.date.localeCompare(b.date));
}

/** Clientes que aparecem no calendário, com um índice de cor estável (0 = MaweCreate). */
export function contentColorIndex(data: AppData, clientId: ID | null): number {
  if (!clientId) return 0;
  const ids = [...data.clients].sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map((c) => c.id);
  const index = ids.indexOf(clientId);
  return index < 0 ? 7 : (index % 7) + 1;
}

/** Semanas (segunda a domingo) que cobrem o mês, para montar a grade do calendário. */
export function monthGrid(month: MonthKey): ISODate[][] {
  const first = `${month}-01`;
  const weekday = (parseISODate(first).getDay() + 6) % 7;
  let cursor = addDays(first, -weekday);
  const last = lastDayOfMonth(month);
  const weeks: ISODate[][] = [];
  while (cursor <= last) {
    const week: ISODate[] = [];
    for (let i = 0; i < 7; i++) week.push(addDays(cursor, i));
    weeks.push(week);
    cursor = addDays(cursor, 7);
  }
  return weeks;
}

// ---------------------------------------------------------------- Tráfego pago

export type CampaignInput = Pick<
  Campaign,
  'name' | 'clientId' | 'platform' | 'objective' | 'startDate' | 'endDate' | 'budget' | 'spent' | 'reach' | 'clicks' | 'results' | 'learnings'
>;

function nonNegative(value: number | null, label: string): number | null {
  if (value === null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} não pode ser negativo.`);
  return value;
}

export function saveCampaign(draft: AppData, id: ID | null, input: CampaignInput, ctx: ActionContext): Campaign {
  const name = input.name.trim();
  if (!name) throw new Error('Dê um nome para a campanha.');
  if (!isValidISODate(input.startDate)) throw new Error('Informe a data de início.');
  if (input.endDate && (!isValidISODate(input.endDate) || input.endDate < input.startDate)) throw new Error('A data de fim deve ser depois do início.');
  if (input.clientId && !draft.clients.some((c) => c.id === input.clientId)) throw new Error('Cliente não encontrado.');
  const clean: CampaignInput = {
    ...input,
    name,
    learnings: input.learnings.trim(),
    budget: nonNegative(input.budget, 'A verba'),
    spent: nonNegative(input.spent, 'O valor gasto'),
    reach: nonNegative(input.reach, 'O alcance'),
    clicks: nonNegative(input.clicks, 'Os cliques'),
    results: nonNegative(input.results, 'Os resultados'),
  };
  if (id) {
    const campaign = mustFind(draft.campaigns, id, 'Campanha');
    Object.assign(campaign, clean);
    return campaign;
  }
  const campaign: Campaign = { id: createId('cmp'), ...clean, createdAt: ctx.now.toISOString() };
  draft.campaigns.push(campaign);
  return campaign;
}

export function deleteCampaign(draft: AppData, id: ID): void {
  mustFind(draft.campaigns, id, 'Campanha');
  draft.campaigns = draft.campaigns.filter((c) => c.id !== id);
}

/** Custo por resultado (gasto ÷ resultados), quando dá para calcular. */
export function costPerResult(c: Pick<Campaign, 'spent' | 'results'>): number | null {
  return c.spent !== null && c.results ? c.spent / c.results : null;
}

export type CampaignState = 'agendada' | 'ativa' | 'encerrada';

export function campaignState(c: Campaign, today: ISODate): CampaignState {
  if (c.startDate > today) return 'agendada';
  if (c.endDate && c.endDate < today) return 'encerrada';
  return 'ativa';
}

/**
 * Quanto foi investido no mês. O valor gasto de cada campanha é dividido pelos
 * dias em que ela rodou; entra no mês só a parte dos dias daquele mês.
 * Campanha sem data de fim conta até hoje.
 */
export function monthAdSpend(data: AppData, month: MonthKey, today: ISODate): number {
  const from = `${month}-01`;
  const to = lastDayOfMonth(month);
  let total = 0;
  for (const c of data.campaigns) {
    if (!c.spent) continue;
    const end = c.endDate ?? (today > c.startDate ? today : c.startDate);
    const days = diffInDays(c.startDate, end) + 1;
    const overlapStart = c.startDate > from ? c.startDate : from;
    const overlapEnd = end < to ? end : to;
    if (overlapEnd < overlapStart) continue;
    total += (c.spent * (diffInDays(overlapStart, overlapEnd) + 1)) / days;
  }
  return Math.round(total * 100) / 100;
}

export function campaignsInMonth(data: AppData, month: MonthKey, today: ISODate): Campaign[] {
  const from = `${month}-01`;
  const to = lastDayOfMonth(month);
  return data.campaigns
    .filter((c) => c.startDate <= to && (c.endDate ?? (today > c.startDate ? today : c.startDate)) >= from)
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

// ---------------------------------------------------------------- Serviços e preços

export type ServiceInput = Omit<Service, 'id' | 'isDemo'>;

export function saveService(draft: AppData, id: ID | null, input: ServiceInput): Service {
  const name = input.name.trim();
  if (!name) throw new Error('Dê um nome para o serviço.');
  if (!(input.price >= 0)) throw new Error('Informe o valor do serviço.');
  if (input.deliveryDays !== null && !(Number.isInteger(input.deliveryDays) && input.deliveryDays >= 0)) throw new Error('O prazo deve ser um número de dias.');
  if (draft.services.some((s) => s.id !== id && s.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'))) {
    throw new Error(`Já existe um serviço chamado "${name}".`);
  }
  const clean = { ...input, name, includes: input.includes.trim() };
  if (id) {
    const service = mustFind(draft.services, id, 'Serviço');
    Object.assign(service, clean);
    return service;
  }
  const service: Service = { id: createId('svc'), ...clean };
  draft.services.push(service);
  return service;
}

export function toggleServiceActive(draft: AppData, id: ID): void {
  const service = mustFind(draft.services, id, 'Serviço');
  service.active = !service.active;
}

/** Linhas do "o que está incluso", para virar checklist de projeto. */
export function serviceIncludes(service: Pick<Service, 'includes'>): string[] {
  return service.includes.split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
}

// ---------------------------------------------------------------- Propostas

export interface ProposalItemInput {
  serviceId: ID | null;
  name?: string;
  price?: number;
  quantity?: number;
}

export type ProposalInput = Pick<Proposal, 'title' | 'clientId' | 'opportunityId' | 'validUntil' | 'notes' | 'contractLink' | 'startDate' | 'paymentTerms'> & {
  items: ProposalItemInput[];
};

function buildItems(draft: AppData, inputs: ProposalItemInput[], previous: ProposalItem[] = []): ProposalItem[] {
  const items: ProposalItem[] = [];
  for (const input of inputs) {
    const quantity = Math.max(1, Math.round(input.quantity ?? 1));
    if (input.serviceId) {
      const service = mustFind(draft.services, input.serviceId, 'Serviço');
      const old = previous.find((p) => p.serviceId === input.serviceId);
      items.push({
        id: old?.id ?? createId('itm'),
        serviceId: service.id,
        name: input.name?.trim() || service.name,
        category: service.category,
        price: input.price ?? service.price,
        billing: service.billing,
        quantity,
      });
    } else if (input.name?.trim()) {
      items.push({ id: createId('itm'), serviceId: null, name: input.name.trim(), category: 'outro', price: input.price ?? 0, billing: 'unico', quantity });
    }
  }
  for (const item of items) if (!(item.price >= 0)) throw new Error(`Valor inválido em "${item.name}".`);
  return items;
}

export interface ProposalTotals {
  /** Pagamento único (sites, sistemas, pacotes). */
  oneTime: number;
  /** Valor mensal (planos). */
  monthly: number;
}

export function proposalTotals(p: Pick<Proposal, 'items'>): ProposalTotals {
  const totals: ProposalTotals = { oneTime: 0, monthly: 0 };
  for (const item of p.items) {
    if (item.billing === 'mensal') totals.monthly += item.price * item.quantity;
    else totals.oneTime += item.price * item.quantity;
  }
  return totals;
}

export function proposalRecipient(data: AppData, p: Pick<Proposal, 'clientId' | 'opportunityId'>): string {
  if (p.clientId) return data.clients.find((c) => c.id === p.clientId)?.company ?? 'Cliente removido';
  if (p.opportunityId) return data.opportunities.find((o) => o.id === p.opportunityId)?.company ?? 'Oportunidade removida';
  return 'Sem destinatário';
}

export function saveProposal(draft: AppData, id: ID | null, input: ProposalInput, ctx: ActionContext): Proposal {
  if (!input.clientId && !input.opportunityId) throw new Error('Escolha para quem é a proposta (cliente ou oportunidade).');
  if (input.clientId) mustFind(draft.clients, input.clientId, 'Cliente');
  if (input.opportunityId) mustFind(draft.opportunities, input.opportunityId, 'Oportunidade');
  if (input.validUntil && !isValidISODate(input.validUntil)) throw new Error('Validade inválida.');
  if (input.startDate && !isValidISODate(input.startDate)) throw new Error('Data de início inválida.');
  const existing = id ? mustFind(draft.proposals, id, 'Proposta') : null;
  const items = buildItems(draft, input.items, existing?.items);
  if (!items.length) throw new Error('Escolha pelo menos um serviço.');
  const recipient = proposalRecipient(draft, input);
  const fields = {
    title: input.title.trim() || `Proposta – ${recipient}`,
    clientId: input.clientId,
    opportunityId: input.clientId ? (input.opportunityId ?? null) : input.opportunityId,
    validUntil: input.validUntil,
    notes: input.notes.trim(),
    contractLink: cleanUrl(input.contractLink),
    startDate: input.startDate,
    paymentTerms: input.paymentTerms.trim(),
    items,
  };
  if (existing) {
    Object.assign(existing, fields);
    return existing;
  }
  const proposal: Proposal = {
    id: createId('ppl'),
    ...fields,
    status: 'rascunho',
    sentAt: null,
    decidedAt: null,
    projectIds: [],
    createdBy: ctx.userId,
    createdAt: ctx.now.toISOString(),
  };
  draft.proposals.push(proposal);
  return proposal;
}

/** Muda o status. Datas de envio e decisão são registradas para as metas. */
export function setProposalStatus(draft: AppData, id: ID, status: ProposalStatus, today: ISODate): void {
  const p = mustFind(draft.proposals, id, 'Proposta');
  p.status = status;
  if (status === 'rascunho') {
    p.sentAt = null;
    p.decidedAt = null;
    return;
  }
  if (!p.sentAt) p.sentAt = today;
  p.decidedAt = status === 'aceita' || status === 'recusada' ? (p.decidedAt ?? today) : null;
}

export function deleteProposal(draft: AppData, id: ID): void {
  mustFind(draft.proposals, id, 'Proposta');
  draft.proposals = draft.proposals.filter((p) => p.id !== id);
}

export interface AcceptOptions {
  createProjects: boolean;
  createInstallments: boolean;
}

export interface AcceptResult {
  clientId: ID | null;
  projects: Project[];
  installments: number;
}

/**
 * Proposta aceita: registra a decisão e, se pedido, cria o cliente (quando a
 * proposta era para uma oportunidade), um projeto por serviço e as parcelas do
 * valor único conforme a forma de pagamento.
 */
export function acceptProposal(draft: AppData, id: ID, options: AcceptOptions, today: ISODate, ctx: ActionContext): AcceptResult {
  const p = mustFind(draft.proposals, id, 'Proposta');
  setProposalStatus(draft, id, 'aceita', today);
  const result: AcceptResult = { clientId: p.clientId, projects: [], installments: 0 };
  if (!options.createProjects && !options.createInstallments) return result;

  if (!p.clientId && p.opportunityId) {
    const client = convertOpportunityToClient(draft, p.opportunityId, ctx);
    p.clientId = client.id;
  }
  if (!p.clientId) return result;
  result.clientId = p.clientId;
  const client = mustFind(draft.clients, p.clientId, 'Cliente');
  if (client.contractStatus === 'proposta_enviada') client.contractStatus = p.contractLink ? 'contrato_assinado' : 'em_andamento';

  const start = p.startDate ?? today;
  if (options.createProjects) {
    for (const item of p.items) {
      const service = item.serviceId ? draft.services.find((s) => s.id === item.serviceId) : undefined;
      const type = projectTypeForCategory(item.category);
      const due = addDays(start, Math.max(1, Math.ceil(((service?.deliveryDays ?? 10) * 7) / 5)));
      const project = createProject(
        draft,
        {
          name: item.name,
          clientId: client.id,
          ownerIds: [ctx.userId],
          status: 'planejamento',
          startDate: start,
          dueDate: type === 'plano_mensal' ? '' : due,
          description: service ? `${service.includes}` : '',
          type,
          period: type === 'plano_mensal' ? monthKey(start) : null,
          serviceId: item.serviceId,
          extra: type === 'plano_mensal' || type === 'pacote_conteudo' ? { amount: item.price * item.quantity, billingDay: type === 'plano_mensal' ? Number(start.slice(8, 10)) : null } : undefined,
        },
        ctx,
        service && (type === 'plano_mensal' || type === 'pacote_conteudo' || type === 'outro') && serviceIncludes(service).length ? { checklist: serviceIncludes(service) } : {},
      );
      result.projects.push(project);
      p.projectIds.push(project.id);
    }
  }

  if (options.createInstallments) {
    const { oneTime } = proposalTotals(p);
    if (oneTime > 0) {
      const terms = p.paymentTerms || PAYMENT_TERMS[0];
      const longest = Math.max(1, ...p.items.map((i) => draft.services.find((s) => s.id === i.serviceId)?.deliveryDays ?? 10));
      const delivery = addDays(start, Math.ceil((longest * 7) / 5));
      const method = 'Pix';
      if (/50%/.test(terms)) {
        const half = Math.round((oneTime / 2) * 100) / 100;
        addInstallment(draft, client.id, { description: 'Entrada (50%)', amount: half, dueDate: start, method });
        addInstallment(draft, client.id, { description: 'Entrega (50%)', amount: Math.round((oneTime - half) * 100) / 100, dueDate: delivery, method });
        result.installments = 2;
      } else if (/entrega/i.test(terms)) {
        addInstallment(draft, client.id, { description: 'Pagamento na entrega', amount: oneTime, dueDate: delivery, method });
        result.installments = 1;
      } else {
        addInstallment(draft, client.id, { description: 'Pagamento à vista', amount: oneTime, dueDate: start, method });
        result.installments = 1;
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------- Metas e indicadores

export const EMPTY_GOALS: MonthlyGoals = { revenue: null, newClients: null, contacts: null, proposalsSent: null, proposalsAccepted: null };

export function setMonthlyGoals(draft: AppData, month: MonthKey, goals: MonthlyGoals): void {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('Mês inválido.');
  for (const [key, value] of Object.entries(goals)) {
    if (value !== null && (!Number.isFinite(value) || value < 0)) throw new Error(`Meta inválida (${key}).`);
  }
  draft.goals[month] = { ...goals };
}

/** Metas do mês; se ainda não foram definidas, usa as do mês anterior como sugestão. */
export function goalsFor(data: AppData, month: MonthKey): { goals: MonthlyGoals; inherited: boolean } {
  if (data.goals[month]) return { goals: data.goals[month], inherited: false };
  const previous = Object.keys(data.goals).filter((k) => k < month).sort().pop();
  return { goals: previous ? data.goals[previous] : EMPTY_GOALS, inherited: Boolean(previous) };
}

export interface MonthIndicators {
  revenue: number;
  newClients: number;
  contacts: { total: number; bySource: Record<string, number> };
  replies: { total: number; bySource: Record<string, number> };
  proposalsSent: number;
  proposalsAccepted: number;
}

/** Origens que aparecem separadas nas metas; as demais somam em "Outras". */
export const TRACKED_SOURCES = ['Google Maps', 'Instagram'];

export function sourceBucket(source: string): string {
  return TRACKED_SOURCES.includes(source) ? source : 'Outras';
}

export function monthIndicators(data: AppData, month: MonthKey): MonthIndicators {
  const inMonth = (date: string | null | undefined) => Boolean(date && date.slice(0, 7) === month);
  const ind: MonthIndicators = {
    revenue: monthRevenue(data, month),
    newClients: data.clients.filter((c) => inMonth(c.createdAt.slice(0, 10))).length,
    contacts: { total: 0, bySource: {} },
    replies: { total: 0, bySource: {} },
    proposalsSent: data.proposals.filter((p) => inMonth(p.sentAt)).length,
    proposalsAccepted: data.proposals.filter((p) => p.status === 'aceita' && inMonth(p.decidedAt)).length,
  };
  for (const o of data.opportunities) {
    // Conta quem recebeu contato neste mês e, desses, quantos responderam.
    if (!inMonth(o.contactedAt)) continue;
    const bucket = sourceBucket(o.source);
    ind.contacts.total++;
    ind.contacts.bySource[bucket] = (ind.contacts.bySource[bucket] ?? 0) + 1;
    if (o.repliedAt) {
      ind.replies.total++;
      ind.replies.bySource[bucket] = (ind.replies.bySource[bucket] ?? 0) + 1;
    }
  }
  return ind;
}
