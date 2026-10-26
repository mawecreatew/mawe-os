/** Biblioteca: modelos de mensagens, propostas, checklists, processos e decisões da agência. */
import { formatShortDate, formatTimestamp } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { pluralize } from '../core/format.ts';
import { escapeHtml, html, multiline, raw, type SafeHtml } from '../core/html.ts';
import { navigate, type Route } from '../core/router.ts';
import { LIBRARY_CATEGORIES } from '../domain/labels.ts';
import { deleteLibraryItem, saveLibraryItem } from '../domain/operations.ts';
import { decisionsOf, findProject, findUser } from '../domain/selectors.ts';
import type { LibraryCategory, LibraryItem } from '../domain/types.ts';
import { requirePermission, store } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, demoTag, emptyState, pageHeader, segmented } from '../ui/components.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';
import { openDecisionForm } from './projects.ts';

type Tab = LibraryCategory | 'decisoes';

function isTab(value: string | undefined): value is Tab {
  return value === 'decisoes' || LIBRARY_CATEGORIES.some((c) => c.value === value);
}

/** Destaca campos variáveis como {{nome}} para facilitar a personalização. */
function withPlaceholders(text: string): SafeHtml {
  return raw(escapeHtml(text).replace(/\{\{\s*([\w]+)\s*\}\}/g, '<mark class="placeholder">{{$1}}</mark>').replace(/\n/g, '<br>'));
}

function findItem(id: string | undefined): LibraryItem | undefined {
  return store().data.library.find((l) => l.id === id);
}

function openItem(item: LibraryItem): void {
  const author = findUser(store().data, item.authorId);
  openModal({
    title: item.title,
    description: item.summary,
    size: 'lg',
    body: html`
      <div class="library-content">${withPlaceholders(item.content)}</div>
      <p class="muted small">Atualizado por ${author?.shortName ?? '—'} em ${formatTimestamp(item.updatedAt)}</p>
      <footer class="form-actions">
        ${button({ label: 'Excluir', action: 'library:delete', variant: 'danger', icon: 'trash', size: 'sm', data: { id: item.id } })}
        <div class="form-actions__main">
          ${button({ label: 'Editar', action: 'library:edit', icon: 'edit', data: { id: item.id } })}
          ${button({ label: 'Copiar texto', action: 'library:copy', variant: 'primary', icon: 'copy', data: { id: item.id } })}
        </div>
      </footer>
    `,
  });
}

function openItemForm(item?: LibraryItem, category: LibraryCategory = 'mensagem'): void {
  openModal({
    title: item ? 'Editar item' : 'Novo item da biblioteca',
    size: 'lg',
    body: html`
      <form class="form" data-form="library:save" data-id="${item?.id ?? ''}">
        <div class="form-grid">
          ${textField({ name: 'title', label: 'Título', value: item?.title, required: true, autofocus: true })}
          ${selectField({ name: 'category', label: 'Categoria', value: item?.category ?? category, options: LIBRARY_CATEGORIES })}
        </div>
        ${textField({ name: 'summary', label: 'Resumo', value: item?.summary, placeholder: 'Quando usar este material?' })}
        ${textareaField({ name: 'content', label: 'Conteúdo', value: item?.content, rows: 10, required: true, hint: 'Use {{campo}} para partes que mudam a cada uso, como {{nome}} ou {{empresa}}.' })}
        ${formActions(item ? 'Salvar alterações' : 'Adicionar à biblioteca')}
      </form>
    `,
  });
}

registerForms({
  'library:save': async (form, values) => {
    requirePermission('library:edit');
    const input = {
      title: values.text('title'),
      category: values.text('category') as LibraryCategory,
      summary: values.text('summary'),
      content: values.text('content'),
    };
    if (!input.title || !input.content) throw new Error('Preencha título e conteúdo.');
    const id = form.dataset.id || null;
    await store().apply((draft, ctx) => saveLibraryItem(draft, id, input, ctx));
    closeModal();
    toast(id ? 'Item atualizado.' : 'Item adicionado à biblioteca.');
    navigate(`/biblioteca/${input.category}`);
  },
});

registerActions({
  'library:open': (el) => {
    const item = findItem(el.dataset.id);
    if (item) openItem(item);
  },
  'library:new': (el) => openItemForm(undefined, (el.dataset.category as LibraryCategory) || 'mensagem'),
  'library:edit': (el) => openItemForm(findItem(el.dataset.id)),
  'library:copy': async (el) => {
    const item = findItem(el.dataset.id);
    if (!item) return;
    try {
      await navigator.clipboard.writeText(item.content);
      toast('Texto copiado. Revise e personalize antes de usar.');
    } catch {
      toast('Não foi possível copiar automaticamente. Selecione o texto e copie manualmente.', 'error');
    }
  },
  'library:delete': async (el) => {
    const ok = await confirmAction({ title: 'Excluir item', text: 'Este material será removido da biblioteca.', confirmLabel: 'Excluir' });
    if (!ok) return;
    await store().apply((draft) => deleteLibraryItem(draft, el.dataset.id!));
    toast('Item excluído.');
  },
  'library:tab': (el) => navigate(`/biblioteca/${el.dataset.value}`),
  'agency-decision:new': () => openDecisionForm(null),
});

function renderDecisions(): SafeHtml {
  const { data } = store();
  const decisions = decisionsOf(data, null);
  if (!decisions.length) {
    return emptyState({
      icon: 'decision',
      title: 'Nenhuma decisão registrada',
      text: 'Registre decisões importantes para que os dois sócios — e os agentes — tenham o mesmo contexto.',
      action: button({ label: 'Registrar decisão', action: 'agency-decision:new', variant: 'primary', icon: 'plus' }),
    });
  }
  return html`<ol class="decision-log">
    ${decisions.map((d) => {
      const project = findProject(data, d.projectId);
      return html`<li class="decision-log__item">
        <span class="decision-log__date">${formatShortDate(d.date)}</span>
        <div class="decision-log__body">
          <div class="decision-log__head">
            <strong>${d.title}</strong>
            ${project ? html`<a class="badge badge--info" href="#/projetos/${project.id}">${project.name}</a>` : badge('Agência', 'accent')}
            ${demoTag(d)}
          </div>
          ${d.context ? html`<p>${multiline(d.context)}</p>` : ''}
          <small>Registrada por ${findUser(data, d.authorId)?.shortName ?? '—'}</small>
        </div>
      </li>`;
    })}
  </ol>`;
}

function renderItems(category: LibraryCategory): SafeHtml {
  const meta = LIBRARY_CATEGORIES.find((c) => c.value === category)!;
  const items = store()
    .data.library.filter((l) => l.category === category)
    .sort((a, b) => a.title.localeCompare(b.title));
  if (!items.length) {
    return emptyState({
      icon: 'library',
      title: `Nenhum item em ${meta.plural.toLowerCase()}`,
      text: meta.description,
      action: button({ label: 'Adicionar', action: 'library:new', variant: 'primary', icon: 'plus', data: { category } }),
    });
  }
  return html`<div class="library-grid">
    ${items.map(
      (item) => html`<button type="button" class="library-card" data-action="library:open" data-id="${item.id}">
        <span class="library-card__title">${item.title}</span>
        <span class="library-card__summary">${item.summary}</span>
        <span class="library-card__foot">
          <span>${icon('clock', 13)} ${formatShortDate(item.updatedAt.slice(0, 10))} · ${findUser(store().data, item.authorId)?.shortName ?? ''}</span>
          ${demoTag(item)}
        </span>
      </button>`,
    )}
  </div>`;
}

export const libraryView: View = {
  title: () => 'Biblioteca',
  render: (route: Route) => {
    const { data } = store();
    const tab: Tab = isTab(route.params[0]) ? route.params[0] : 'mensagem';
    const meta = LIBRARY_CATEGORIES.find((c) => c.value === tab);

    return html`
      ${pageHeader({
        title: 'Biblioteca',
        subtitle: `${pluralize(data.library.length, 'material', 'materiais')} · ${pluralize(data.decisions.length, 'decisão registrada', 'decisões registradas')}`,
        actions:
          tab === 'decisoes'
            ? button({ label: 'Registrar decisão', action: 'agency-decision:new', variant: 'primary', icon: 'plus' })
            : button({ label: 'Novo item', action: 'library:new', variant: 'primary', icon: 'plus', data: { category: tab } }),
      })}
      <div class="toolbar">
        ${segmented({
          label: 'Categorias da biblioteca',
          action: 'library:tab',
          value: tab,
          items: [
            ...LIBRARY_CATEGORIES.map((c) => ({ value: c.value, label: c.plural, count: data.library.filter((l) => l.category === c.value).length })),
            { value: 'decisoes', label: 'Decisões', count: data.decisions.length },
          ],
        })}
      </div>
      <p class="section-intro">${meta ? meta.description : 'Registro das decisões importantes da agência e dos projetos, da mais recente para a mais antiga.'}</p>
      <div class="panel panel--flush">${tab === 'decisoes' ? renderDecisions() : renderItems(tab)}</div>
    `;
  },
};
