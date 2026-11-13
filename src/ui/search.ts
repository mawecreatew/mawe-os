/** Busca rápida (Ctrl+K ou o botão "Buscar" do menu). */
import { registerActions, registerForms } from '../core/events.ts';
import { html } from '../core/html.ts';
import { navigate } from '../core/router.ts';
import { SEARCH_KIND_LABELS, globalSearch } from '../domain/search.ts';
import { store } from '../app/context.ts';
import { icon } from './icons.ts';
import { closeModal, openModal } from './overlay.ts';

function renderResults(query: string): string {
  const results = globalSearch(store().data, query);
  if (query.trim().length < 2) return html`<p class="search-results__hint">Digite pelo menos 2 letras: nome de lead, cliente, projeto, tarefa, serviço...</p>`.value;
  if (!results.length) return html`<p class="search-results__hint">Nada encontrado para "${query}".</p>`.value;
  return html`<ul class="search-results__list">${results.map(
    (r, i) => html`<li><a class="search-result${i === 0 ? ' is-first' : ''}" href="${r.href}" data-action="search:go">
      <span class="search-result__kind">${SEARCH_KIND_LABELS[r.kind]}</span>
      <span class="search-result__title">${r.title}</span>
      <span class="search-result__sub">${r.subtitle}</span>
    </a></li>`,
  )}</ul>`.value;
}

export function openSearch(): void {
  openModal({
    title: 'Buscar',
    body: html`
      <form class="search-box" data-form="search:submit">
        <span class="search-box__icon">${icon('search', 18)}</span>
        <input class="input" id="global-search" name="q" type="search" placeholder="Buscar em todo o sistema" autocomplete="off" autofocus data-input="search:query" aria-label="Buscar em todo o sistema" />
      </form>
      <div class="search-results" id="global-search-results" aria-live="polite">${renderResults('')}</div>
      <p class="muted small">${icon('info', 13)} Atalho: <kbd>Ctrl</kbd> + <kbd>K</kbd> em qualquer tela. <kbd>Enter</kbd> abre o primeiro resultado.</p>`,
  });
}

registerActions({
  'search:open': () => openSearch(),
  'search:query': (el) => {
    const box = document.getElementById('global-search-results');
    if (box) box.innerHTML = renderResults((el as HTMLInputElement).value);
  },
  'search:go': () => closeModal(),
});

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
  });
}

registerForms({
  'search:submit': () => {
    const first = document.querySelector<HTMLAnchorElement>('#global-search-results .search-result');
    if (!first) return;
    closeModal();
    navigate(first.getAttribute('href')!);
  },
});
