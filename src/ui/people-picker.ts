/**
 * Seletor de responsáveis: marca uma ou mais pessoas, "Todos" de uma vez e
 * permite cadastrar alguém novo ali mesmo (a pessoa só é criada ao salvar).
 */
import { registerActions, type FormValues } from '../core/events.ts';
import { initials } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { assignableUsers, NEW_PERSON_PREFIX } from '../domain/people.ts';
import type { AppData, ID } from '../domain/types.ts';
import { avatar } from './components.ts';

let pickerCounter = 0;

export function peopleField(options: { name: string; label: string; data: AppData; value: readonly ID[]; className?: string }): SafeHtml {
  const id = `people-${options.name}-${++pickerCounter}`;
  const users = assignableUsers(options.data);
  return html`
    <fieldset class="${cx('field people-field', options.className)}" data-people-picker data-name="${options.name}">
      <legend class="field__label">${options.label}<span class="field__req" aria-hidden="true"> *</span></legend>
      <div class="people-field__options" data-people-options>
        ${users.map(
          (u) => html`<label class="people-chip" data-person-name="${u.name.toLocaleLowerCase('pt-BR')}">
            <input type="checkbox" class="visually-hidden" name="${options.name}" value="${u.id}" ${options.value.includes(u.id) ? 'checked' : ''} />
            ${avatar(u)}<span>${u.shortName}</span>
          </label>`,
        )}
        ${users.length > 1
          ? html`<button type="button" class="people-chip people-chip--all" data-action="people:all">Todos</button>`
          : ''}
      </div>
      <div class="people-field__add">
        <label class="visually-hidden" for="${id}">Adicionar outra pessoa</label>
        <input class="input people-field__input" id="${id}" name="${options.name}__nova" data-people-input
          type="text" maxlength="40" autocomplete="off" placeholder="Adicionar outra pessoa (nome)" />
        <button type="button" class="btn btn--secondary btn--sm" data-action="people:add">Adicionar</button>
      </div>
    </fieldset>
  `;
}

/** Lê os responsáveis marcados (e um nome digitado que não chegou a ser adicionado). */
export function readPeople(values: FormValues, name: string): string[] {
  const picked = values.all(name);
  const typed = values.text(`${name}__nova`);
  return typed ? [...picked, NEW_PERSON_PREFIX + typed] : picked;
}

function addTyped(picker: HTMLElement): void {
  const input = picker.querySelector<HTMLInputElement>('[data-people-input]');
  const options = picker.querySelector<HTMLElement>('[data-people-options]');
  if (!input || !options) return;
  const name = input.value.replace(/\s+/g, ' ').trim();
  if (!name) {
    input.focus();
    return;
  }
  const key = name.toLocaleLowerCase('pt-BR');
  const existing = Array.from(options.querySelectorAll<HTMLElement>('[data-person-name]')).find((el) => el.dataset.personName === key);
  if (existing) {
    existing.querySelector<HTMLInputElement>('input')!.checked = true;
  } else {
    // Monta o item com DOM (textContent) para nunca interpretar o nome como HTML.
    const label = document.createElement('label');
    label.className = 'people-chip is-new';
    label.dataset.personName = key;
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'visually-hidden';
    check.name = picker.dataset.name!;
    check.value = NEW_PERSON_PREFIX + name;
    check.checked = true;
    const badge = document.createElement('span');
    badge.className = 'avatar avatar--sm avatar--guest';
    badge.textContent = initials(name);
    const text = document.createElement('span');
    text.textContent = name.split(' ')[0];
    label.append(check, badge, text);
    options.insertBefore(label, options.querySelector('.people-chip--all'));
  }
  input.value = '';
  input.focus();
}

registerActions({
  'people:add': (el) => {
    const picker = el.closest<HTMLElement>('[data-people-picker]');
    if (picker) addTyped(picker);
  },
  'people:all': (el) => {
    const boxes = Array.from(el.closest('[data-people-picker]')?.querySelectorAll<HTMLInputElement>('input[type=checkbox]') ?? []);
    const allOn = boxes.every((b) => b.checked);
    for (const b of boxes) b.checked = !allOn;
  },
});

// Enter no campo de nome adiciona a pessoa em vez de enviar o formulário.
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (event.key !== 'Enter' || !target?.matches('[data-people-input]')) return;
    event.preventDefault();
    const picker = target.closest<HTMLElement>('[data-people-picker]');
    if (picker) addTyped(picker);
  });
}
