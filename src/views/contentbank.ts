/**
 * Marketing › Banco de conteúdo: stories, legendas, artes e fotos prontas do
 * Instagram da Mawe. Textos com botão Copiar; imagens com Salvar na galeria
 * (no celular abre o compartilhar, com a opção de salvar nas fotos).
 */
import { formatShortDate } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { pluralize } from '../core/format.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import { CONTENT_KINDS, contentList, contentThemes, deleteContentItem, kindMeta, markContentUsed, saveContentItem } from '../domain/contentbank.ts';
import type { ContentBankItem, ContentBankKind, StoredFile } from '../domain/types.ts';
import { allowed, rerender, store, today } from '../app/context.ts';
import { cachedProofBlob, discardProof, proofBlob, storeProof } from '../app/proofs.ts';
import type { View } from '../app/view.ts';
import { badge, button, emptyState, pageHeader, segmented } from '../ui/components.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

const ui = { kind: 'todos' as ContentBankKind | 'todos', theme: '', query: '' };

/** Lado maior das imagens guardadas: suficiente para o Instagram, leve para o armazenamento. */
const MAX_SIDE = 1600;

/** Reduz fotos grandes antes de enviar (JPEG de boa qualidade, fundo branco onde era transparente). */
async function shrinkForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) throw new Error('Escolha uma imagem (JPG, PNG ou WEBP).');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Não foi possível ler esta imagem. Tente salvar de novo como JPG ou PNG.');
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 1.5 * 1024 * 1024) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
}

function findItem(id: string | undefined): ContentBankItem | undefined {
  return (store().data.contentBank ?? []).find((c) => c.id === id);
}

function openForm(item?: ContentBankItem, kind: ContentBankKind = 'story'): void {
  const { data } = store();
  const current = item?.kind ?? kind;
  openModal({
    title: item ? 'Editar conteúdo' : 'Novo conteúdo',
    description: 'Textos ficam com botão Copiar. Artes e fotos ficam com Salvar na galeria.',
    size: 'lg',
    body: html`<form class="form" data-form="bank:save" data-id="${item?.id ?? ''}">
      <div class="form-grid">
        ${selectField({ name: 'kind', label: 'Tipo', value: current, options: CONTENT_KINDS.map((k) => ({ value: k.value, label: k.label })) })}
        ${textField({ name: 'theme', label: 'Tema', value: item?.theme ?? '', placeholder: 'Ex.: Bastidores', suggestions: contentThemes(data) })}
      </div>
      ${textField({ name: 'title', label: 'Nome curto', value: item?.title ?? '', required: true, placeholder: 'Ex.: Antes e depois da barbearia' })}
      ${textareaField({ name: 'text', label: 'Texto (story ou legenda)', value: item?.text ?? '', rows: 6, placeholder: 'Para artes e fotos, a legenda sugerida (opcional).' })}
      <div class="field">
        <label class="field__label" for="content-file">Imagem (artes e fotos)</label>
        <input class="input" id="content-file" name="file" type="file" accept="image/png,image/jpeg,image/webp" />
        <p class="field__hint">${item?.file ? 'Escolha outra só se quiser trocar a imagem.' : 'Fotos grandes são reduzidas sozinhas, sem perder qualidade no Instagram.'}</p>
      </div>
      ${formActions(item ? 'Salvar' : 'Guardar no banco')}
    </form>`,
  });
}

registerForms({
  'bank:save': async (form, values) => {
    const id = form.dataset.id || null;
    const kind = values.text('kind') as ContentBankKind;
    const input = form.querySelector<HTMLInputElement>('#content-file');
    const chosen = input?.files?.[0];
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      let file: StoredFile | undefined;
      if (chosen) {
        const stored = await storeProof(await shrinkForUpload(chosen), 'conteudo/');
        file = { ...stored, id: `img_${Date.now().toString(36)}`, category: 'Conteúdo', uploadedAt: new Date().toISOString(), authorId: store().currentUser.id };
      }
      const old = id ? findItem(id)?.file ?? null : null;
      await store().apply((draft, ctx) => saveContentItem(draft, id, { kind, theme: values.text('theme'), title: values.text('title'), text: values.text('text'), ...(file ? { file } : {}) }, ctx));
      if (file && old) await discardProof(old);
      closeModal();
      toast(id ? 'Conteúdo atualizado.' : 'Guardado no banco de conteúdo.');
    } finally {
      if (button) button.disabled = false;
    }
  },
});

registerActions({
  'bank:new': (el) => openForm(undefined, (el.dataset.kind as ContentBankKind) || 'story'),
  'bank:edit': (el) => openForm(findItem(el.dataset.id)),
  'bank:kind': (el) => {
    ui.kind = el.dataset.value as typeof ui.kind;
    rerender();
  },
  'bank:theme': (el) => {
    ui.theme = (el as HTMLSelectElement).value;
    rerender();
  },
  'bank:search': (el) => {
    ui.query = (el as HTMLInputElement).value;
    rerender();
  },
  'bank:copy': async (el) => {
    const item = findItem(el.dataset.id);
    if (!item?.text) return;
    try {
      await navigator.clipboard.writeText(item.text);
      toast('Texto copiado.');
    } catch {
      toast('Não foi possível copiar automaticamente. Selecione o texto e copie.', 'error');
    }
  },
  'bank:download': async (el) => {
    const item = findItem(el.dataset.id);
    if (!item?.file) return;
    const blob = cachedProofBlob(item.file) ?? (await proofBlob(item.file));
    const name = item.file.name || `${item.title}.jpg`;
    const file = new File([blob], name, { type: blob.type || item.file.type });
    // No celular, o compartilhar tem "Salvar imagem" (vai para a galeria).
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: item.title });
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    toast('Imagem baixada.');
  },
  'bank:used': async (el) => {
    await store().apply((draft) => markContentUsed(draft, el.dataset.id!, today()));
  },
  'bank:delete': async (el) => {
    const ok = await confirmAction({ title: 'Apagar conteúdo?', text: 'Some para os dois sócios e não dá para desfazer. Se for imagem, baixe antes se ainda quiser.', confirmLabel: 'Apagar' });
    if (!ok) return;
    const file = await store().apply((draft) => deleteContentItem(draft, el.dataset.id!));
    await discardProof(file);
    toast('Conteúdo apagado.');
  },
});

function card(item: ContentBankItem): SafeHtml {
  const meta = kindMeta(item.kind);
  const t = today();
  return html`<article class="${cx('bank-card', meta.hasImage && 'bank-card--image')}">
    ${item.file ? html`<button type="button" class="bank-card__media" data-action="proof:open" data-proof="${item.id}" aria-label="Abrir a imagem ${item.title}"><img data-proof="${item.id}" alt="${item.title}" /></button>` : ''}
    <div class="bank-card__body">
      <header class="bank-card__head">
        <span class="bank-card__title">${item.title}</span>
        <span class="bank-card__tags">${badge(meta.label, meta.hasImage ? 'accent' : 'info')}${item.theme ? badge(item.theme, 'neutral') : ''}</span>
      </header>
      ${item.text ? html`<p class="bank-card__text">${multiline(item.text)}</p>` : ''}
      <p class="bank-card__used">${item.usedAt ? `Postado em ${formatShortDate(item.usedAt)}${item.usedAt === t ? ' (hoje)' : ''}` : 'Ainda não postado'}</p>
    </div>
    <footer class="bank-card__foot">
      ${item.file ? button({ label: 'Salvar na galeria', action: 'bank:download', icon: 'download', size: 'sm', variant: 'primary', data: { id: item.id } }) : ''}
      ${item.text ? button({ label: item.file ? 'Copiar legenda' : 'Copiar', action: 'bank:copy', icon: 'copy', size: 'sm', variant: item.file ? 'secondary' : 'primary', data: { id: item.id } }) : ''}
      ${button({ label: item.usedAt === t ? 'Postado hoje' : 'Postei hoje', action: 'bank:used', icon: 'check', size: 'sm', variant: 'ghost', data: { id: item.id } })}
      <span class="bank-card__more">
        ${button({ label: `Editar ${item.title}`, action: 'bank:edit', icon: 'edit', iconOnly: true, size: 'sm', variant: 'ghost', data: { id: item.id } })}
        ${allowed('library:edit') ? button({ label: `Apagar ${item.title}`, action: 'bank:delete', icon: 'trash', iconOnly: true, size: 'sm', variant: 'ghost', data: { id: item.id } }) : ''}
      </span>
    </footer>
  </article>`;
}

export const contentBankView: View = {
  title: () => 'Banco de conteúdo',
  render: () => {
    const { data } = store();
    const all = data.contentBank ?? [];
    const list = contentList(data, { kind: ui.kind, theme: ui.theme, query: ui.query });
    const themes = contentThemes(data).filter((th) => all.some((c) => c.theme === th));
    return html`
      ${pageHeader({
        title: 'Banco de conteúdo',
        subtitle: all.length ? `${pluralize(all.length, 'conteúdo pronto', 'conteúdos prontos')} para os dias sem ideia` : 'Stories, legendas, artes e fotos prontas para postar',
        actions: button({ label: 'Novo conteúdo', action: 'bank:new', variant: 'primary', icon: 'plus', data: { kind: ui.kind === 'todos' ? 'story' : ui.kind } }),
      })}
      <div class="msg-filters">
        ${segmented({
          label: 'Tipos de conteúdo',
          action: 'bank:kind',
          value: ui.kind,
          items: [{ value: 'todos', label: 'Todos', count: all.length }, ...CONTENT_KINDS.map((k) => ({ value: k.value, label: k.plural, count: all.filter((c) => c.kind === k.value).length }))],
        })}
        ${themes.length
          ? html`<label class="visually-hidden" for="content-theme">Tema</label>
              <select class="input select msg-filters__select" id="content-theme" data-change="bank:theme">
                <option value="">Todos os temas</option>
                ${themes.map((th) => html`<option value="${th}" ${th === ui.theme ? 'selected' : ''}>${th}</option>`)}
              </select>`
          : ''}
        <label class="visually-hidden" for="content-search">Buscar no banco</label>
        <input class="input msg-filters__search" id="content-search" type="search" placeholder="Buscar" value="${ui.query}" data-input="bank:search" />
      </div>
      ${list.length
        ? html`<div class="bank-grid">${list.map(card)}</div>`
        : html`<div class="panel">${emptyState({
            icon: 'image',
            title: all.length ? 'Nada neste filtro' : 'O banco ainda está vazio',
            text: all.length ? undefined : 'Guarde aqui as frases de story, as legendas e as artes prontas. Assim dá para apagar do celular e baixar de novo na hora de postar.',
            action: all.length ? undefined : button({ label: 'Guardar o primeiro', action: 'bank:new', variant: 'primary', icon: 'plus' }),
          })}</div>`}
      <p class="muted small">${icon('info', 13)} O que está há mais tempo sem postar aparece primeiro. No celular, Salvar na galeria abre o compartilhar: escolha "Salvar imagem".</p>
    `;
  },
};
