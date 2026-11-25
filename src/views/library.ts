/** Biblioteca: modelos de mensagens, propostas, checklists, processos e decisões da agência. */
import { formatShortDate, formatTimestamp } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { normalizeText, pluralize } from '../core/format.ts';
import { cx, escapeHtml, html, multiline, raw, type SafeHtml } from '../core/html.ts';
import { navigate, type Route } from '../core/router.ts';
import { LIBRARY_CATEGORIES } from '../domain/labels.ts';
import { MAX_OPTIONS, MESSAGE_GROUPS, MESSAGE_STEPS, followUpCadence, groupLabel, messageOptions, stepLabel, stepOrder } from '../domain/messages.ts';
import { deleteLibraryItem, saveLibraryItem } from '../domain/operations.ts';
import { decisionsOf, findProject, findUser } from '../domain/selectors.ts';
import type { LibraryCategory, LibraryItem, MessageGroup, MessageStep } from '../domain/types.ts';
import { requirePermission, rerender, store } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, demoTag, emptyState, pageHeader, segmented } from '../ui/components.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';
import { openDecisionForm } from './projects.ts';

type Tab = LibraryCategory | 'decisoes';

/** Filtros das mensagens e a opção escolhida em cada card (vale até recarregar). */
const ui = { group: 'todos' as MessageGroup | 'todos', query: '', picked: new Map<string, number>(), open: new Set<string>() };

/** Texto longo aparece resumido, com "Ler mais". */
const SHORT_TEXT = 220;

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
      ${messageOptions(item).map(
        (text, i, all) => html`${all.length > 1 ? html`<h3 class="msg-pick__title">Opção ${i + 1}</h3>` : ''}<div class="library-content">${withPlaceholders(text)}</div>`,
      )}
      <p class="muted small">Atualizado por ${author?.shortName ?? '—'} em ${formatTimestamp(item.updatedAt)}</p>
      <footer class="form-actions">
        ${button({ label: 'Excluir', action: 'library:delete', variant: 'danger', icon: 'trash', size: 'sm', data: { id: item.id } })}
        <div class="form-actions__main">
          ${button({ label: 'Editar', action: 'library:edit', icon: 'edit', data: { id: item.id } })}
          ${button({ label: 'Copiar opção 1', action: 'library:copy', variant: 'primary', icon: 'copy', data: { id: item.id, index: '0' } })}
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
        <div class="form-grid">
          ${selectField({ name: 'group', label: 'Grupo (só para mensagens)', value: item?.group ?? 'situacao', options: MESSAGE_GROUPS })}
          ${selectField({
            name: 'step',
            label: 'Sugerir sozinha em',
            value: item?.step ?? '',
            options: [{ value: '', label: 'Nenhum momento (só na lista)' }, ...MESSAGE_STEPS.map((s) => ({ value: s.value, label: s.label }))],
            hint: 'Ex.: 1º follow-up aparece no Quem chamar hoje no dia certo.',
          })}
        </div>
        ${textareaField({ name: 'content', label: 'Opção 1', value: item?.content, rows: 7, required: true, hint: 'Use {{campo}} para partes que mudam a cada uso, como {{nome}} ou {{empresa}}.' })}
        ${Array.from({ length: MAX_OPTIONS - 1 }, (_, i) =>
          textareaField({ name: `option${i + 2}`, label: `Opção ${i + 2} (opcional)`, value: item?.options?.[i] ?? '', rows: 5, placeholder: 'Outra versão do mesmo texto, com outro tom.' }),
        )}
        ${formActions(item ? 'Salvar alterações' : 'Adicionar à biblioteca')}
      </form>
    `,
  });
}



registerForms({
  'library:save': async (form, values) => {
    requirePermission('library:edit');
    const category = values.text('category') as LibraryCategory;
    const step = (values.text('step') || null) as MessageStep | null;
    const input = {
      title: values.text('title'),
      category,
      summary: values.text('summary'),
      content: values.text('content'),
      options: Array.from({ length: MAX_OPTIONS - 1 }, (_, i) => values.text(`option${i + 2}`)).filter(Boolean),
      group: category === 'mensagem' ? (step ? (MESSAGE_STEPS.find((s) => s.value === step)?.group ?? 'situacao') : (values.text('group') as MessageGroup)) : null,
      step: category === 'mensagem' ? step : null,
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
    const text = messageOptions(item)[Number(el.dataset.index ?? 0)] ?? item.content;
    try {
      await navigator.clipboard.writeText(text);
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
  'library:group': (el) => {
    ui.group = el.dataset.value as typeof ui.group;
    rerender();
  },
  'library:option': (el) => {
    ui.picked.set(el.dataset.id!, Number(el.dataset.index));
    rerender();
  },
  'library:search': (el) => {
    ui.query = (el as HTMLInputElement).value;
    rerender();
  },
  'library:more': (el) => {
    const id = el.dataset.id!;
    if (ui.open.has(id)) ui.open.delete(id);
    else ui.open.add(id);
    rerender();
  },
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

function messageCard(item: LibraryItem, cadence: number[]): SafeHtml {
  const options = messageOptions(item);
  const picked = Math.min(ui.picked.get(item.id) ?? 0, options.length - 1);
  const text = options[picked];
  const long = text.length > SHORT_TEXT || text.split('\n').length > 5;
  const open = ui.open.has(item.id);
  return html`<article class="msg-card">
    <header class="msg-card__head">
      <button type="button" class="msg-card__title" data-action="library:open" data-id="${item.id}">${item.title}</button>
      <span class="msg-card__tags">
        ${item.step ? badge(stepLabel(item.step, cadence), 'accent') : badge(groupLabel(item.group), 'neutral')}
        ${demoTag(item)}
      </span>
    </header>
    ${item.summary ? html`<p class="msg-card__summary">${item.summary}</p>` : ''}
    ${options.length > 1
      ? html`<div class="msg-card__options" role="tablist" aria-label="Versões de ${item.title}">
          ${options.map(
            (_, i) => html`<button type="button" role="tab" class="${cx('msg-card__option', i === picked && 'is-active')}" aria-selected="${i === picked ? 'true' : 'false'}"
              data-action="library:option" data-id="${item.id}" data-index="${String(i)}">Opção ${i + 1}</button>`,
          )}
        </div>`
      : ''}
    <div class="${cx('msg-card__text', long && !open && 'is-short')}">${withPlaceholders(text)}</div>
    <footer class="msg-card__foot">
      ${long ? html`<button type="button" class="msg-card__more" data-action="library:more" data-id="${item.id}" aria-expanded="${open ? 'true' : 'false'}">${open ? 'Ler menos' : 'Ler mais'}</button>` : html`<span></span>`}
      <span class="msg-card__actions">
        ${button({ label: 'Editar', action: 'library:edit', icon: 'edit', variant: 'ghost', size: 'sm', data: { id: item.id } })}
        ${button({ label: options.length > 1 ? `Copiar opção ${picked + 1}` : 'Copiar', action: 'library:copy', icon: 'copy', variant: 'primary', size: 'sm', data: { id: item.id, index: String(picked) } })}
      </span>
    </footer>
  </article>`;
}

function renderMessages(): SafeHtml {
  const { data } = store();
  const all = data.library.filter((l) => l.category === 'mensagem');
  const q = normalizeText(ui.query);
  const cadence = followUpCadence(data);
  const list = all
    .filter((l) => ui.group === 'todos' || (l.group ?? 'situacao') === ui.group)
    .filter((l) => !q || normalizeText(`${l.title} ${l.summary} ${messageOptions(l).join(' ')}`).includes(q))
    .sort((a, b) => (ui.group === 'followup' ? stepOrder(a.step) - stepOrder(b.step) : 0) || a.title.localeCompare(b.title, 'pt-BR'));
  return html`
    <div class="msg-filters">
      ${segmented({
        label: 'Grupos de mensagens',
        action: 'library:group',
        value: ui.group,
        items: [
          { value: 'todos', label: 'Todas', count: all.length },
          ...MESSAGE_GROUPS.map((g) => ({ value: g.value, label: g.label, count: all.filter((l) => (l.group ?? 'situacao') === g.value).length })),
        ],
      })}
      <label class="visually-hidden" for="library-search">Buscar nas mensagens</label>
      <input class="input msg-filters__search" id="library-search" type="search" placeholder="Buscar nas mensagens" value="${ui.query}" data-input="library:search" />
    </div>
    ${ui.group === 'followup' ? html`<p class="section-intro">A régua de follow-up segue os dias da etapa Aguardando resposta (${cadence.join(', ')} dias depois da primeira mensagem). No Quem chamar hoje, o botão Mensagem abre a mensagem do dia certo.</p>` : ''}
    ${list.length
      ? html`<div class="msg-grid">${list.map((item) => messageCard(item, cadence))}</div>`
      : html`<div class="panel">${emptyState({
          icon: 'message',
          title: all.length ? 'Nenhuma mensagem neste filtro' : 'Nenhuma mensagem ainda',
          action: button({ label: 'Nova mensagem', action: 'library:new', variant: 'primary', icon: 'plus', data: { category: 'mensagem' } }),
        })}</div>`}
  `;
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
  title: () => 'Mensagens prontas',
  render: (route: Route) => {
    const { data } = store();
    const tab: Tab = isTab(route.params[0]) ? route.params[0] : 'mensagem';
    const meta = LIBRARY_CATEGORIES.find((c) => c.value === tab);

    return html`
      ${pageHeader({
        title: 'Mensagens prontas',
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
      ${tab === 'mensagem'
        ? renderMessages()
        : html`<p class="section-intro">${meta ? meta.description : 'Registro das decisões importantes da agência e dos projetos, da mais recente para a mais antiga.'}</p>
            <div class="panel panel--flush">${tab === 'decisoes' ? renderDecisions() : renderItems(tab)}</div>`}
    `;
  },
};
