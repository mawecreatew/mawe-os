/** Busca rápida em tudo (Ctrl+K): leads, clientes, projetos, tarefas, serviços, propostas e biblioteca. */
import { normalizeText } from '../core/format.ts';
import { stageLabel } from './labels.ts';
import type { AppData } from './types.ts';

export type SearchKind = 'lead' | 'cliente' | 'projeto' | 'tarefa' | 'servico' | 'proposta' | 'biblioteca';

export interface SearchResult {
  kind: SearchKind;
  title: string;
  subtitle: string;
  href: string;
  /** Quanto menor, mais relevante. */
  score: number;
}

export const SEARCH_KIND_LABELS: Record<SearchKind, string> = {
  lead: 'Lead',
  cliente: 'Cliente',
  projeto: 'Projeto',
  tarefa: 'Tarefa',
  servico: 'Serviço',
  proposta: 'Proposta',
  biblioteca: 'Biblioteca',
};

function score(term: string, title: string, extra: string): number | null {
  const t = normalizeText(title);
  if (t.startsWith(term)) return 0;
  if (t.split(/\s+/).some((w) => w.startsWith(term))) return 1;
  if (t.includes(term)) return 2;
  if (normalizeText(extra).includes(term)) return 3;
  return null;
}

export function globalSearch(data: AppData, query: string, limit = 12): SearchResult[] {
  const term = normalizeText(query.trim());
  if (term.length < 2) return [];
  const results: SearchResult[] = [];
  const add = (kind: SearchKind, title: string, subtitle: string, href: string, extra = '') => {
    const s = score(term, title, `${subtitle} ${extra}`);
    if (s !== null) results.push({ kind, title, subtitle, href, score: s });
  };
  for (const o of data.opportunities) add('lead', o.company, [stageLabel(data, o.stage), o.segment].filter(Boolean).join(' · '), `#/comercial/${o.id}`, `${o.contactName} ${o.contact.phone ?? ''} ${o.contact.instagram ?? ''} ${o.notes}`);
  for (const c of data.clients) add('cliente', c.company, [c.segment, c.city].filter(Boolean).join(' · '), `#/clientes/${c.id}`, `${c.contactName} ${c.contact.phone ?? ''} ${c.contact.instagram ?? ''}`);
  for (const p of data.projects) add('projeto', p.name, data.clients.find((c) => c.id === p.clientId)?.company ?? '', `#/projetos/${p.id}`, p.description);
  for (const t of data.tasks) if (t.status !== 'concluida') add('tarefa', t.title, 'Tarefa aberta', '#/tarefas', t.description);
  for (const s of data.services) add('servico', s.name, s.active ? 'Serviços e preços' : 'Serviço desativado', '#/servicos', s.includes);
  for (const p of data.proposals) add('proposta', p.title, 'Proposta', `#/comercial/propostas/${p.id}`);
  for (const l of data.library) add('biblioteca', l.title, l.summary, '#/biblioteca', l.content);
  return results.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title, 'pt-BR')).slice(0, limit);
}
