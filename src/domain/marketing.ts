/**
 * Marketing da própria Mawe: ideias de posts, números do Instagram mês a mês,
 * cases do portfólio e de onde vêm os clientes. Também o relatório do mês.
 */
import { firstDayOfMonth, lastDayOfMonth, type ISODate, type MonthKey } from '../core/dates.ts';
import { createId } from '../core/id.ts';
import { clientSource } from './clientcare.ts';
import { monthIndicators } from './business.ts';
import { monthSummary } from './finance.ts';
import { LOST_STAGE, WON_STAGE } from './labels.ts';
import type { ActionContext } from './operations.ts';
import type { AppData, ID, InstagramStat, PortfolioCase, PortfolioLink, PostIdea, PostStatus } from './types.ts';

// ---------------------------------------------------------------- Ideias de posts

export const POST_STATUSES: Array<{ value: PostStatus; label: string }> = [
  { value: 'ideia', label: 'Ideia' },
  { value: 'gravando', label: 'Gravando' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'postado', label: 'Postado' },
];

export const POST_FORMATS = ['Reels', 'Carrossel', 'Post', 'Story', 'Antes e depois', 'Bastidores', 'Depoimento'];

export interface PostIdeaInput {
  title: string;
  format: string;
  notes: string;
  date: ISODate | null;
  status?: PostStatus;
}

export function savePostIdea(draft: AppData, id: ID | null, input: PostIdeaInput, ctx: ActionContext): PostIdea {
  const title = input.title.trim();
  if (!title) throw new Error('Escreva a ideia do post.');
  draft.postIdeas ??= [];
  const fields = { title, format: input.format.trim(), notes: input.notes.trim(), date: input.date || null };
  if (id) {
    const idea = draft.postIdeas.find((p) => p.id === id);
    if (!idea) throw new Error('Ideia não encontrada.');
    Object.assign(idea, fields, input.status ? { status: input.status } : {});
    return idea;
  }
  const idea: PostIdea = { id: createId('post'), ...fields, status: input.status ?? 'ideia', authorId: ctx.userId, createdAt: ctx.now.toISOString() };
  draft.postIdeas.push(idea);
  return idea;
}

export function movePostIdea(draft: AppData, id: ID, status: PostStatus, today: ISODate): void {
  const idea = (draft.postIdeas ?? []).find((p) => p.id === id);
  if (!idea) throw new Error('Ideia não encontrada.');
  if (!POST_STATUSES.some((s) => s.value === status)) throw new Error('Situação inválida.');
  idea.status = status;
  if (status === 'postado' && !idea.date) idea.date = today;
}

export function deletePostIdea(draft: AppData, id: ID): void {
  draft.postIdeas = (draft.postIdeas ?? []).filter((p) => p.id !== id);
}

/** Posts da Mawe postados no mês (ideias marcadas como postadas + calendário). */
export function postsInMonth(data: AppData, month: MonthKey): number {
  const fromIdeas = (data.postIdeas ?? []).filter((p) => p.status === 'postado' && p.date?.slice(0, 7) === month).length;
  const fromCalendar = data.contents.filter((c) => c.clientId === null && c.status === 'postado' && c.date.slice(0, 7) === month).length;
  return fromIdeas + fromCalendar;
}

// ---------------------------------------------------------------- Instagram mês a mês

export function saveInstagramStat(draft: AppData, input: InstagramStat): void {
  if (!/^\d{4}-\d{2}$/.test(input.month)) throw new Error('Escolha o mês.');
  if (!Number.isInteger(input.followers) || input.followers < 0) throw new Error('Informe o número de seguidores.');
  for (const v of [input.reach, input.messages]) if (v !== null && (!Number.isInteger(v) || v < 0)) throw new Error('Use números inteiros.');
  const list = (draft.instagramStats ?? []).filter((s) => s.month !== input.month);
  draft.instagramStats = [...list, { ...input }].sort((a, b) => a.month.localeCompare(b.month));
}

export function deleteInstagramStat(draft: AppData, month: string): void {
  draft.instagramStats = (draft.instagramStats ?? []).filter((s) => s.month !== month);
}

export interface GrowthSummary {
  last: InstagramStat | null;
  /** Diferença para o mês anotado antes. */
  monthChange: number | null;
  /** Diferença para o mesmo mês do ano anterior (quando houver). */
  yearChange: number | null;
  /** Diferença desde o primeiro mês anotado. */
  sinceStart: number | null;
}

export function instagramGrowth(data: AppData): GrowthSummary {
  const list = [...(data.instagramStats ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  const last = list.at(-1) ?? null;
  if (!last) return { last: null, monthChange: null, yearChange: null, sinceStart: null };
  const prev = list.at(-2);
  const [y, m] = last.month.split('-');
  const lastYear = list.find((s) => s.month === `${Number(y) - 1}-${m}`);
  return {
    last,
    monthChange: prev ? last.followers - prev.followers : null,
    yearChange: lastYear ? last.followers - lastYear.followers : null,
    sinceStart: list.length > 1 ? last.followers - list[0].followers : null,
  };
}

/** Seguidores no fim de cada ano anotado (para comparar ano a ano). */
export function followersByYear(data: AppData): Array<{ year: string; followers: number }> {
  const map = new Map<string, number>();
  for (const s of [...(data.instagramStats ?? [])].sort((a, b) => a.month.localeCompare(b.month))) map.set(s.month.slice(0, 4), s.followers);
  return [...map.entries()].map(([year, followers]) => ({ year, followers }));
}

// ---------------------------------------------------------------- Cases do portfólio

export interface CaseInput {
  title: string;
  clientId: ID | null;
  projectId: ID | null;
  before: string;
  after: string;
  result: string;
  link: string;
  status: PortfolioCase['status'];
}

export function saveCase(draft: AppData, id: ID | null, input: CaseInput, ctx: ActionContext): PortfolioCase {
  const title = input.title.trim();
  if (!title) throw new Error('Dê um nome para o case.');
  draft.cases ??= [];
  const fields = { ...input, title, before: input.before.trim(), after: input.after.trim(), result: input.result.trim(), link: input.link.trim() };
  if (id) {
    const item = draft.cases.find((c) => c.id === id);
    if (!item) throw new Error('Case não encontrado.');
    Object.assign(item, fields);
    return item;
  }
  const item: PortfolioCase = { id: createId('case'), ...fields, createdAt: ctx.now.toISOString() };
  draft.cases.push(item);
  return item;
}

export function deleteCase(draft: AppData, id: ID): void {
  draft.cases = (draft.cases ?? []).filter((c) => c.id !== id);
}

/** Sites publicados que ainda não viraram case (sugestões). */
export function caseSuggestions(data: AppData): Array<{ projectId: ID; name: string; client: string; link: string }> {
  const used = new Set((data.cases ?? []).map((c) => c.projectId).filter(Boolean));
  return data.projects
    .filter((p) => p.status === 'publicado' && (p.type === 'site' || p.type === 'sistema') && !used.has(p.id))
    .map((p) => ({ projectId: p.id, name: p.name, client: data.clients.find((c) => c.id === p.clientId)?.company ?? '', link: p.links.production }));
}

// ---------------------------------------------------------------- De onde vêm os clientes

export function clientOrigins(data: AppData): Array<{ source: string; clients: number; leads: number; won: number }> {
  const map = new Map<string, { source: string; clients: number; leads: number; won: number }>();
  const row = (source: string) => {
    const key = source || 'Não informado';
    const r = map.get(key) ?? { source: key, clients: 0, leads: 0, won: 0 };
    map.set(key, r);
    return r;
  };
  for (const c of data.clients) row(clientSource(data, c)).clients++;
  for (const o of data.opportunities) {
    const r = row(o.source);
    r.leads++;
    if (o.stage === WON_STAGE || o.clientId) r.won++;
  }
  return [...map.values()].sort((a, b) => b.clients - a.clients || b.leads - a.leads);
}

// ---------------------------------------------------------------- Relatório do mês

export interface MonthReport {
  month: MonthKey;
  revenue: number;
  expenses: number;
  profit: number;
  newClients: number;
  contacted: number;
  replied: number;
  won: number;
  lost: number;
  replyRate: number | null;
  proposalsSent: number;
  proposalsAccepted: number;
  bySource: Array<{ source: string; contacted: number; replied: number; won: number }>;
  projectsDelivered: number;
  posts: number;
  followers: number | null;
  followersChange: number | null;
}

export function monthReport(data: AppData, month: MonthKey): MonthReport {
  const from = firstDayOfMonth(month);
  const to = lastDayOfMonth(month);
  const inMonth = (d: string | null | undefined) => Boolean(d && d >= from && d <= to);
  const summary = monthSummary(data, month);
  const ind = monthIndicators(data, month);
  const sources = new Map<string, { source: string; contacted: number; replied: number; won: number }>();
  let won = 0;
  let lost = 0;
  for (const o of data.opportunities) {
    if (inMonth(o.closedAt)) {
      if (o.stage === WON_STAGE) won++;
      if (o.stage === LOST_STAGE) lost++;
    }
    if (!inMonth(o.contactedAt)) continue;
    const key = o.source || 'Não informado';
    const r = sources.get(key) ?? { source: key, contacted: 0, replied: 0, won: 0 };
    r.contacted++;
    if (o.repliedAt) r.replied++;
    if (o.stage === WON_STAGE || o.clientId) r.won++;
    sources.set(key, r);
  }
  const stats = [...(data.instagramStats ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  const stat = stats.find((s) => s.month === month) ?? null;
  const before = stats.filter((s) => s.month < month).at(-1) ?? null;
  return {
    month,
    revenue: summary.received,
    expenses: summary.paid,
    profit: summary.profit,
    newClients: ind.newClients,
    contacted: ind.contacts.total,
    replied: ind.replies.total,
    won,
    lost,
    replyRate: ind.contacts.total ? (ind.replies.total / ind.contacts.total) * 100 : null,
    proposalsSent: ind.proposalsSent,
    proposalsAccepted: ind.proposalsAccepted,
    bySource: [...sources.values()].sort((a, b) => b.contacted - a.contacted),
    projectsDelivered: data.projects.filter((p) => inMonth(p.publishedAt)).length,
    posts: postsInMonth(data, month),
    followers: stat?.followers ?? null,
    followersChange: stat && before ? stat.followers - before.followers : null,
  };
}

// ---------------------------------------------------------------- Links do portfólio (Kit)

export const PORTFOLIO_KINDS: Array<{ value: PortfolioLink['kind']; label: string }> = [
  { value: 'agencia', label: 'Site da agência' },
  { value: 'cliente', label: 'Site de cliente' },
  { value: 'demo', label: 'Demo' },
];

export function savePortfolioLink(draft: AppData, id: ID | null, input: Omit<PortfolioLink, 'id'>): PortfolioLink {
  const title = input.title.trim();
  const url = input.url.trim();
  if (!title) throw new Error('Dê um nome para o link.');
  if (!/^https?:\/\/\S+\.\S+/i.test(url)) throw new Error('Cole o endereço completo (começando com https://).');
  draft.portfolioLinks ??= [];
  const fields = { title, url, kind: input.kind, niche: input.niche.trim() };
  if (id) {
    const link = draft.portfolioLinks.find((l) => l.id === id);
    if (!link) throw new Error('Link não encontrado.');
    Object.assign(link, fields);
    return link;
  }
  const link: PortfolioLink = { id: createId('port'), ...fields };
  draft.portfolioLinks.push(link);
  return link;
}

export function deletePortfolioLink(draft: AppData, id: ID): void {
  draft.portfolioLinks = (draft.portfolioLinks ?? []).filter((l) => l.id !== id);
}

/** Links guardados + sites publicados de clientes que ainda não estão na lista. */
export function portfolioLinks(data: AppData): Array<PortfolioLink & { auto?: boolean }> {
  const saved = data.portfolioLinks ?? [];
  const urls = new Set(saved.map((l) => l.url.replace(/\/$/, '')));
  const auto = data.projects
    .filter((p) => p.status === 'publicado' && p.links.production && !urls.has(p.links.production.replace(/\/$/, '')))
    .map((p) => {
      const client = data.clients.find((c) => c.id === p.clientId);
      return { id: `auto_${p.id}`, title: client?.company ?? p.name, url: p.links.production, kind: 'cliente' as const, niche: client?.segment ?? '', auto: true };
    });
  const order = { agencia: 0, cliente: 1, demo: 2 };
  return [...saved, ...auto].sort((a, b) => order[a.kind] - order[b.kind] || a.niche.localeCompare(b.niche, 'pt-BR') || a.title.localeCompare(b.title, 'pt-BR'));
}
