/**
 * Banco de conteúdo do Instagram da Mawe: stories, legendas, artes e fotos
 * prontas. Nos dias sem ideia, é só abrir, copiar ou baixar e postar.
 */
import { normalizeText } from '../core/format.ts';
import { createId } from '../core/id.ts';
import type { ActionContext } from './operations.ts';
import type { AppData, ContentBankItem, ContentBankKind, ID, StoredFile } from './types.ts';
import type { ISODate } from '../core/dates.ts';

export const CONTENT_KINDS: Array<{ value: ContentBankKind; label: string; plural: string; hasImage: boolean }> = [
  { value: 'story', label: 'Story', plural: 'Stories', hasImage: false },
  { value: 'legenda', label: 'Legenda', plural: 'Legendas', hasImage: false },
  { value: 'arte', label: 'Arte pronta', plural: 'Artes prontas', hasImage: true },
  { value: 'foto', label: 'Foto', plural: 'Fotos', hasImage: true },
];

export const CONTENT_THEMES = ['Agência', 'Bastidores', 'Dica', 'Portfólio', 'Depoimento', 'Abertura do dia', 'Chamada para orçamento'];

export function kindMeta(kind: ContentBankKind): (typeof CONTENT_KINDS)[number] {
  return CONTENT_KINDS.find((k) => k.value === kind) ?? CONTENT_KINDS[0];
}

export type ContentInput = Pick<ContentBankItem, 'kind' | 'theme' | 'title' | 'text'> & { file?: StoredFile | null };

export function saveContentItem(draft: AppData, id: ID | null, input: ContentInput, ctx: ActionContext): ContentBankItem {
  const list = (draft.contentBank ??= []);
  const meta = kindMeta(input.kind);
  const title = input.title.trim();
  const text = input.text.trim();
  if (!title) throw new Error('Dê um nome curto para o conteúdo.');
  if (id) {
    const item = list.find((c) => c.id === id);
    if (!item) throw new Error('Conteúdo não encontrado.');
    Object.assign(item, { kind: input.kind, theme: input.theme.trim(), title, text });
    if (input.file !== undefined) item.file = input.file;
    if (meta.hasImage && !item.file) throw new Error('Escolha a imagem.');
    if (!meta.hasImage && !text) throw new Error('Escreva o texto.');
    return item;
  }
  if (meta.hasImage && !input.file) throw new Error('Escolha a imagem.');
  if (!meta.hasImage && !text) throw new Error('Escreva o texto.');
  const item: ContentBankItem = {
    id: createId('cnt'),
    kind: input.kind,
    theme: input.theme.trim(),
    title,
    text,
    file: input.file ?? null,
    usedAt: null,
    authorId: ctx.userId,
    createdAt: ctx.now.toISOString(),
  };
  list.push(item);
  return item;
}

/** Apaga e devolve o arquivo da imagem (para apagar do armazenamento também). */
export function deleteContentItem(draft: AppData, id: ID): StoredFile | null {
  const list = draft.contentBank ?? [];
  const item = list.find((c) => c.id === id);
  draft.contentBank = list.filter((c) => c.id !== id);
  return item?.file ?? null;
}

/** "Postei hoje": guarda o dia, para não repetir o mesmo conteúdo seguido. */
export function markContentUsed(draft: AppData, id: ID, today: ISODate): void {
  const item = (draft.contentBank ?? []).find((c) => c.id === id);
  if (!item) throw new Error('Conteúdo não encontrado.');
  item.usedAt = item.usedAt === today ? null : today;
}

/** Filtra e ordena: o que está há mais tempo sem postar aparece primeiro. */
export function contentList(data: Pick<AppData, 'contentBank'>, filter: { kind?: ContentBankKind | 'todos'; theme?: string; query?: string }): ContentBankItem[] {
  const q = normalizeText(filter.query ?? '');
  return (data.contentBank ?? [])
    .filter((c) => !filter.kind || filter.kind === 'todos' || c.kind === filter.kind)
    .filter((c) => !filter.theme || c.theme === filter.theme)
    .filter((c) => !q || normalizeText(`${c.title} ${c.text} ${c.theme}`).includes(q))
    .sort((a, b) => (a.usedAt ?? '').localeCompare(b.usedAt ?? '') || b.createdAt.localeCompare(a.createdAt));
}

export function contentThemes(data: Pick<AppData, 'contentBank'>): string[] {
  return [...new Set([...CONTENT_THEMES, ...(data.contentBank ?? []).map((c) => c.theme).filter(Boolean)])];
}

export function findContentFile(data: Pick<AppData, 'contentBank'>, id: ID): StoredFile | undefined {
  return (data.contentBank ?? []).find((c) => c.id === id)?.file ?? undefined;
}
