/**
 * Aprendizados: o que vocês aprendem nos cursos (e na prática), organizado por
 * tema, com "como aplicar na agência" e a marcação de "já coloquei em prática".
 */
import { diffInDays, type ISODate } from '../core/dates.ts';
import { normalizeText } from '../core/format.ts';
import { createId } from '../core/id.ts';
import type { ActionContext } from './operations.ts';
import type { AppData, ID, Learning } from './types.ts';

export const LEARNING_THEMES = [
  'Mentalidade e transição',
  'Tipos de site',
  'Escopo, prazos e preços',
  'Fluxo com o cliente',
  'Prospecção',
  'Instagram e redes',
  'Design e cores',
  'Ferramentas e organização',
  'Outros',
];

export type LearningInput = Pick<Learning, 'theme' | 'title' | 'text' | 'howToApply' | 'source'>;

export function saveLearning(draft: AppData, id: ID | null, input: LearningInput, ctx: ActionContext): Learning {
  const list = (draft.learnings ??= []);
  const clean = {
    theme: input.theme.trim() || 'Outros',
    title: input.title.trim(),
    text: input.text.trim(),
    howToApply: input.howToApply.trim(),
    source: input.source.trim(),
  };
  if (!clean.title) throw new Error('Dê um título para o aprendizado.');
  if (!clean.text) throw new Error('Escreva o aprendizado.');
  if (id) {
    const item = list.find((l) => l.id === id);
    if (!item) throw new Error('Aprendizado não encontrado.');
    Object.assign(item, clean);
    return item;
  }
  const item: Learning = { id: createId('apr'), ...clean, appliedAt: null, authorId: ctx.userId, createdAt: ctx.now.toISOString() };
  list.push(item);
  return item;
}

export function deleteLearning(draft: AppData, id: ID): void {
  draft.learnings = (draft.learnings ?? []).filter((l) => l.id !== id);
}

/** "Já coloquei em prática" (clicar de novo desmarca). */
export function toggleApplied(draft: AppData, id: ID, today: ISODate): void {
  const item = (draft.learnings ?? []).find((l) => l.id === id);
  if (!item) throw new Error('Aprendizado não encontrado.');
  item.appliedAt = item.appliedAt ? null : today;
}

/** Temas na ordem fixa e, depois, os temas novos que vocês criarem. */
export function learningThemes(data: Pick<AppData, 'learnings'>): string[] {
  const used = (data.learnings ?? []).map((l) => l.theme);
  return [...LEARNING_THEMES.filter((t) => t !== 'Outros'), ...[...new Set(used)].filter((t) => !LEARNING_THEMES.includes(t)), 'Outros'];
}

export function learningList(data: Pick<AppData, 'learnings'>, filter: { theme?: string; query?: string; pending?: boolean }): Learning[] {
  const q = normalizeText(filter.query ?? '');
  const order = learningThemes(data);
  return (data.learnings ?? [])
    .filter((l) => !filter.theme || l.theme === filter.theme)
    .filter((l) => !filter.pending || !l.appliedAt)
    .filter((l) => !q || normalizeText(`${l.title} ${l.text} ${l.howToApply} ${l.source}`).includes(q))
    .sort((a, b) => order.indexOf(a.theme) - order.indexOf(b.theme) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * Um aprendizado por dia para relembrar (o mesmo o dia inteiro, para os dois
 * sócios). Dá preferência aos que ainda não foram colocados em prática.
 */
export function learningOfTheDay(data: Pick<AppData, 'learnings'>, today: ISODate): Learning | null {
  const all = [...(data.learnings ?? [])].sort((a, b) => a.id.localeCompare(b.id));
  const pool = all.filter((l) => !l.appliedAt).length ? all.filter((l) => !l.appliedAt) : all;
  if (!pool.length) return null;
  const day = diffInDays('2026-01-01', today);
  return pool[((day % pool.length) + pool.length) % pool.length];
}

/** Acrescenta as anotações de um curso. As que já estão no sistema não se repetem. */
export function importLearnings(draft: AppData, notes: ReadonlyArray<Omit<Learning, 'appliedAt' | 'authorId' | 'createdAt'>>, ctx: ActionContext): number {
  const list = (draft.learnings ??= []);
  let added = 0;
  notes.forEach((n, i) => {
    if (list.some((l) => l.id === n.id)) return;
    // Um milissegundo de diferença mantém a ordem do caderno.
    list.push({ ...n, appliedAt: null, authorId: ctx.userId, createdAt: new Date(ctx.now.getTime() + i).toISOString() });
    added++;
  });
  return added;
}
