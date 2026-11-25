/**
 * Agência › Aprendizados: as anotações dos cursos organizadas por tema, com
 * "como aplicar na agência" e a marcação de "já coloquei em prática".
 */
import { formatShortDate } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { pluralize } from '../core/format.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import { COURSE_NOTES } from '../data/course-notes.ts';
import { LEARNING_THEMES, deleteLearning, importLearnings, learningList, learningOfTheDay, learningThemes, saveLearning, toggleApplied } from '../domain/learnings.ts';
import type { Learning } from '../domain/types.ts';
import { rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, emptyState, pageHeader, panel, progressBar } from '../ui/components.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

const ui = { theme: '', query: '', pending: false, open: new Set<string>() };

const LONG = 260;

function findItem(id: string | undefined): Learning | undefined {
  return (store().data.learnings ?? []).find((l) => l.id === id);
}

function missingCourseNotes(): number {
  const have = new Set((store().data.learnings ?? []).map((l) => l.id));
  return COURSE_NOTES.filter((n) => !have.has(n.id)).length;
}

function openForm(item?: Learning): void {
  const { data } = store();
  const themes = learningThemes(data);
  openModal({
    title: item ? 'Editar aprendizado' : 'Novo aprendizado',
    description: 'Anotou algo no curso? Escreva com as suas palavras. Dá para fazer pelo celular.',
    size: 'lg',
    body: html`<form class="form" data-form="learning:save" data-id="${item?.id ?? ''}">
      <div class="form-grid">
        ${selectField({ name: 'theme', label: 'Tema', value: item?.theme ?? (ui.theme || themes[0]), options: themes.map((t) => ({ value: t, label: t })) })}
        ${textField({ name: 'source', label: 'De onde veio', value: item?.source ?? 'Curso Descomplicando Sites', placeholder: 'Ex.: Módulo 3, aula 2', suggestions: [...new Set((data.learnings ?? []).map((l) => l.source).filter(Boolean))] })}
      </div>
      ${textField({ name: 'title', label: 'Título', value: item?.title ?? '', required: true, autofocus: true, placeholder: 'Ex.: Os 7 princípios do design' })}
      ${textareaField({ name: 'text', label: 'O que aprendi', value: item?.text ?? '', rows: 8, required: true })}
      ${textareaField({ name: 'howToApply', label: 'Como aplicar na agência (opcional)', value: item?.howToApply ?? '', rows: 3, placeholder: 'Ex.: usar como checklist antes de mandar a prévia' })}
      ${formActions(item ? 'Salvar' : 'Guardar aprendizado')}
    </form>`,
  });
}

registerForms({
  'learning:save': async (form, values) => {
    const id = form.dataset.id || null;
    await store().apply((draft, ctx) =>
      saveLearning(draft, id, { theme: values.text('theme'), title: values.text('title'), text: values.text('text'), howToApply: values.text('howToApply'), source: values.text('source') }, ctx),
    );
    closeModal();
    toast(id ? 'Aprendizado atualizado.' : 'Aprendizado guardado.');
  },
});

registerActions({
  'learning:new': () => openForm(),
  'learning:edit': (el) => openForm(findItem(el.dataset.id)),
  'learning:applied': async (el) => {
    await store().apply((draft) => toggleApplied(draft, el.dataset.id!, today()));
  },
  'learning:delete': async (el) => {
    const ok = await confirmAction({ title: 'Apagar aprendizado?', text: 'Some para os dois sócios.', confirmLabel: 'Apagar' });
    if (!ok) return;
    await store().apply((draft) => deleteLearning(draft, el.dataset.id!));
    toast('Aprendizado apagado.');
  },
  'learning:import': async () => {
    const added = await store().apply((draft, ctx) => importLearnings(draft, COURSE_NOTES, ctx));
    toast(added ? `${pluralize(added, 'anotação importada', 'anotações importadas')} do curso.` : 'As anotações do curso já estavam aqui.');
  },
  'learning:theme': (el) => {
    ui.theme = (el as HTMLSelectElement).value;
    rerender();
  },
  'learning:search': (el) => {
    ui.query = (el as HTMLInputElement).value;
    rerender();
  },
  'learning:pending': (el) => {
    ui.pending = (el as HTMLInputElement).checked;
    rerender();
  },
  'learning:more': (el) => {
    const id = el.dataset.id!;
    if (ui.open.has(id)) ui.open.delete(id);
    else ui.open.add(id);
    rerender();
  },
});

export function learningCard(l: Learning, compact = false): SafeHtml {
  const long = l.text.length > LONG || l.text.split('\n').length > 6;
  const open = ui.open.has(l.id);
  return html`<article class="${cx('learning', l.appliedAt && 'is-applied')}">
    <header class="learning__head">
      <h3 class="learning__title">${l.title}</h3>
      ${compact ? badge(l.theme, 'neutral') : ''}
    </header>
    <div class="${cx('learning__text', long && !open && !compact && 'is-short')}">${multiline(l.text)}</div>
    ${long && !compact ? html`<button type="button" class="msg-card__more" data-action="learning:more" data-id="${l.id}" aria-expanded="${open ? 'true' : 'false'}">${open ? 'Ler menos' : 'Ler mais'}</button>` : ''}
    ${l.howToApply ? html`<p class="learning__apply"><strong>Como aplicar:</strong> ${l.howToApply}</p>` : ''}
    <footer class="learning__foot">
      <label class="learning__check">
        <input type="checkbox" class="check" ${l.appliedAt ? 'checked' : ''} data-change="learning:applied" data-id="${l.id}" />
        <span>${l.appliedAt ? `Coloquei em prática em ${formatShortDate(l.appliedAt)}` : 'Já coloquei em prática'}</span>
      </label>
      ${compact
        ? html`<a class="btn btn--ghost btn--sm" href="#/aprendizados">Ver todos</a>`
        : html`<span class="learning__more">
            ${l.source ? html`<small class="muted">${l.source}</small>` : ''}
            ${button({ label: `Editar ${l.title}`, action: 'learning:edit', icon: 'edit', iconOnly: true, size: 'sm', variant: 'ghost', data: { id: l.id } })}
            ${button({ label: `Apagar ${l.title}`, action: 'learning:delete', icon: 'trash', iconOnly: true, size: 'sm', variant: 'ghost', data: { id: l.id } })}
          </span>`}
    </footer>
  </article>`;
}

/** Card do Início: um aprendizado por dia para relembrar. */
export function renderLearningOfTheDay(): SafeHtml {
  const item = learningOfTheDay(store().data, today());
  if (!item) return html``;
  return panel({ title: 'Aprendizado do dia', icon: 'book', className: 'learning-day', body: learningCard(item, true) });
}

export const learningsView: View = {
  title: () => 'Aprendizados',
  render: () => {
    const { data } = store();
    const all = data.learnings ?? [];
    const applied = all.filter((l) => l.appliedAt).length;
    const missing = missingCourseNotes();
    const list = learningList(data, { theme: ui.theme, query: ui.query, pending: ui.pending });
    const themes = learningThemes(data).filter((t) => all.some((l) => l.theme === t));
    const groups = themes.map((theme) => ({ theme, items: list.filter((l) => l.theme === theme) })).filter((g) => g.items.length);
    return html`
      ${pageHeader({
        title: 'Aprendizados',
        subtitle: all.length ? `${pluralize(all.length, 'aprendizado', 'aprendizados')} · ${applied} já em prática` : 'O que vocês aprendem nos cursos, organizado por tema',
        actions: html`
          ${missing ? button({ label: `Importar anotações do curso (${missing})`, action: 'learning:import', icon: 'download' }) : ''}
          ${button({ label: 'Novo aprendizado', action: 'learning:new', variant: 'primary', icon: 'plus' })}`,
      })}
      ${all.length
        ? html`<div class="learning-progress panel">
            <span><strong>${applied} de ${all.length}</strong> colocados em prática</span>
            ${progressBar(all.length ? Math.round((applied / all.length) * 100) : 0)}
          </div>
          <div class="msg-filters">
            <label class="visually-hidden" for="learning-theme">Tema</label>
            <select class="input select msg-filters__select" id="learning-theme" data-change="learning:theme">
              <option value="">Todos os temas</option>
              ${themes.map((t) => html`<option value="${t}" ${t === ui.theme ? 'selected' : ''}>${t}</option>`)}
            </select>
            <label class="visually-hidden" for="learning-search">Buscar nos aprendizados</label>
            <input class="input msg-filters__search" id="learning-search" type="search" placeholder="Buscar" value="${ui.query}" data-input="learning:search" />
            <label class="learning__check"><input type="checkbox" class="check" ${ui.pending ? 'checked' : ''} data-change="learning:pending" /> <span>Só os que faltam praticar</span></label>
          </div>
          ${groups.length
            ? groups.map(
                (g) => html`<section class="learning-group">
                  <h2 class="learning-group__title">${g.theme} <span class="panel__count">${g.items.length}</span></h2>
                  <div class="learning-grid">${g.items.map((l) => learningCard(l))}</div>
                </section>`,
              )
            : html`<div class="panel">${emptyState({ icon: 'book', compact: true, title: 'Nada neste filtro' })}</div>`}`
        : html`<div class="panel">${emptyState({
            icon: 'book',
            title: 'Nenhum aprendizado ainda',
            text: missing ? 'As anotações do caderno do curso Descomplicando Sites já estão prontas para entrar, organizadas por tema.' : 'Guarde aqui o que aprender nos cursos.',
            action: missing ? button({ label: 'Importar anotações do curso', action: 'learning:import', variant: 'primary', icon: 'download' }) : button({ label: 'Novo aprendizado', action: 'learning:new', variant: 'primary', icon: 'plus' }),
          })}</div>`}
      <p class="muted small">${icon('info', 13)} Temas: ${LEARNING_THEMES.join(', ')}. O Início mostra um aprendizado por dia, começando pelos que ainda não foram colocados em prática.</p>
    `;
  },
};
