/** Bloco de notas: anotações rápidas dos dois (ou só suas), com fixar e virar tarefa. */
import { formatTimestamp } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import { createTask } from '../domain/operations.ts';
import { NOTE_COLORS, deleteNote, saveNote, toggleNotePin, visibleNotes } from '../domain/workspace.ts';
import { findUser } from '../domain/selectors.ts';
import type { Note, NoteColor } from '../domain/types.ts';
import { rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { button, emptyState, pageHeader } from '../ui/components.ts';
import { formActions, textField, textareaField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

const ui = { filter: 'todas' as 'todas' | 'minhas' | 'fixadas', search: '' };

function openNoteForm(note?: Note): void {
  const color = note?.color ?? 'creme';
  openModal({
    title: note ? 'Editar nota' : 'Nova nota',
    body: html`<form class="form" data-form="note:save" data-id="${note?.id ?? ''}">
      ${textField({ name: 'title', label: 'Título', value: note?.title, placeholder: 'Opcional', autofocus: !note })}
      ${textareaField({ name: 'text', label: 'Nota', value: note?.text, rows: 6, placeholder: 'Ideia, recado, link, lista de compras da agência...' })}
      <fieldset class="field">
        <legend class="field__label">Cor</legend>
        <div class="color-pick">
          ${NOTE_COLORS.map(
            (c) => html`<label class="${cx('color-pick__item', `note--${c.value}`)}"><input type="radio" name="color" value="${c.value}" ${c.value === color ? 'checked' : ''} /><span>${c.label}</span></label>`,
          )}
        </div>
      </fieldset>
      ${!note || note.authorId === store().currentUser.id
        ? html`<label class="check-row"><input type="checkbox" class="check" name="private" ${note?.private ? 'checked' : ''} /> <span>Só eu vejo esta nota <small class="muted">(ela fica guardada junto com os dados da agência, mas não aparece para o outro)</small></span></label>`
        : ''}
      ${formActions(note ? 'Salvar' : 'Criar nota')}
    </form>`,
  });
}

function noteCard(note: Note): SafeHtml {
  const { data, currentUser } = store();
  const author = findUser(data, note.authorId);
  return html`<article class="${cx('note', `note--${note.color}`, note.pinned && 'is-pinned')}">
    <header class="note__head">
      ${note.title ? html`<h3 class="note__title">${note.title}</h3>` : html`<span></span>`}
      <span class="note__flags">
        ${note.private ? html`<span class="note__flag" title="Só você vê">${icon('lock', 13)}</span>` : ''}
        ${button({ label: note.pinned ? 'Desafixar' : 'Fixar no topo', iconOnly: true, icon: 'flag', variant: 'ghost', size: 'sm', action: 'note:pin', data: { id: note.id } })}
      </span>
    </header>
    ${note.text ? html`<p class="note__text">${multiline(note.text)}</p>` : ''}
    <footer class="note__foot">
      <small>${author?.shortName.split(' ')[0] ?? 'Alguém'} · ${formatTimestamp(note.updatedAt)}</small>
      <span class="note__actions">
        ${button({ label: 'Virar tarefa', iconOnly: true, icon: 'tasks', variant: 'ghost', size: 'sm', action: 'note:task', data: { id: note.id } })}
        ${button({ label: 'Editar', iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', action: 'note:edit', data: { id: note.id } })}
        ${note.authorId === currentUser.id || !note.private ? button({ label: 'Apagar', iconOnly: true, icon: 'trash', variant: 'ghost', size: 'sm', action: 'note:delete', data: { id: note.id } }) : ''}
      </span>
    </footer>
  </article>`;
}

function render(): SafeHtml {
  const { data, currentUser } = store();
  const all = visibleNotes(data, currentUser.id);
  const q = ui.search.trim().toLocaleLowerCase('pt-BR');
  const list = all
    .filter((n) => ui.filter === 'todas' || (ui.filter === 'minhas' ? n.authorId === currentUser.id : n.pinned))
    .filter((n) => !q || `${n.title} ${n.text}`.toLocaleLowerCase('pt-BR').includes(q));
  return html`
    ${pageHeader({
      title: 'Bloco de notas',
      subtitle: 'Anotações rápidas. Fixe no topo o que não pode esquecer.',
      actions: button({ label: 'Nova nota', action: 'note:new', variant: 'primary', icon: 'plus' }),
    })}
    <div class="toolbar">
      <div class="segmented" role="tablist" aria-label="Quais notas">
        ${(['todas', 'minhas', 'fixadas'] as const).map(
          (f) => html`<button type="button" role="tab" class="${cx('segmented__item', ui.filter === f && 'is-active')}" aria-selected="${ui.filter === f ? 'true' : 'false'}" data-action="note:filter" data-value="${f}">${f === 'todas' ? 'Todas' : f === 'minhas' ? 'Minhas' : 'Fixadas'}</button>`,
        )}
      </div>
      <label class="visually-hidden" for="note-search">Buscar nas notas</label>
      <input class="input toolbar__search" id="note-search" type="search" placeholder="Buscar nas notas" value="${ui.search}" data-input="note:search" autocomplete="off" />
    </div>
    ${list.length
      ? html`<div class="notes-grid">${list.map(noteCard)}</div>`
      : html`<div class="panel">${emptyState({
          icon: 'edit',
          title: all.length ? 'Nenhuma nota com esse filtro' : 'Nenhuma nota ainda',
          text: all.length ? 'Tente outro filtro ou outra palavra.' : 'Anote ideias, recados e coisas para lembrar. As notas dos dois aparecem aqui.',
          action: all.length ? undefined : button({ label: 'Nova nota', action: 'note:new', variant: 'primary', icon: 'plus' }),
        })}</div>`}
  `;
}

export const notesView: View = { title: () => 'Bloco de notas', render };

registerForms({
  'note:save': async (form, values) => {
    const id = form.dataset.id || null;
    await store().apply((draft, ctx) =>
      saveNote(draft, id, { title: values.text('title'), text: values.text('text'), color: (values.text('color') || 'creme') as NoteColor, private: values.checked('private') }, ctx),
    );
    closeModal();
    toast(id ? 'Nota salva.' : 'Nota criada.');
  },
});

registerActions({
  'note:new': () => openNoteForm(),
  'note:edit': (el) => {
    const note = (store().data.notes ?? []).find((n) => n.id === el.dataset.id);
    if (note) openNoteForm(note);
  },
  'note:pin': async (el) => {
    await store().apply((draft, ctx) => toggleNotePin(draft, el.dataset.id!, ctx));
  },
  'note:delete': async (el) => {
    const ok = await confirmAction({ title: 'Apagar nota?', text: 'A nota some para os dois e não dá para desfazer.', confirmLabel: 'Apagar' });
    if (!ok) return;
    await store().apply((draft, ctx) => deleteNote(draft, el.dataset.id!, ctx));
    toast('Nota apagada.');
  },
  'note:task': async (el) => {
    const note = (store().data.notes ?? []).find((n) => n.id === el.dataset.id);
    if (!note) return;
    const title = (note.title || note.text.split('\n')[0]).slice(0, 120);
    await store().apply((draft, ctx) =>
      createTask(draft, { title, description: note.title ? note.text : note.text.split('\n').slice(1).join('\n'), assigneeIds: [ctx.userId], priority: 'media', status: 'a_fazer', dueDate: today(), related: null }, ctx),
    );
    toast('Tarefa criada para hoje. Veja em Tarefas.');
  },
  'note:filter': (el) => {
    ui.filter = el.dataset.value as typeof ui.filter;
    rerender();
  },
  'note:search': (el) => {
    ui.search = (el as HTMLInputElement).value;
    rerender();
  },
});
