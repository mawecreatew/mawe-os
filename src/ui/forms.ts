/** Campos de formulário padronizados. */
import { cx, html, type SafeHtml } from '../core/html.ts';

let fieldCounter = 0;
const fieldId = (name: string) => `f-${name}-${++fieldCounter}`;

interface BaseField {
  name: string;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
}

export function textField(
  options: BaseField & { value?: string | number | null; type?: 'text' | 'email' | 'date' | 'url' | 'tel' | 'number'; placeholder?: string; inputmode?: string; autofocus?: boolean },
): SafeHtml {
  const id = fieldId(options.name);
  return html`
    <div class="${cx('field', options.className)}">
      <label class="field__label" for="${id}">${options.label}${options.required ? html`<span class="field__req" aria-hidden="true"> *</span>` : ''}</label>
      <input class="input" id="${id}" name="${options.name}" type="${options.type ?? 'text'}"
        value="${options.value ?? ''}" ${options.placeholder ? html`placeholder="${options.placeholder}"` : ''}
        ${options.required ? 'required' : ''} ${options.inputmode ? html`inputmode="${options.inputmode}"` : ''}
        ${options.autofocus ? 'autofocus' : ''} autocomplete="off" />
      ${options.hint ? html`<p class="field__hint">${options.hint}</p>` : ''}
    </div>
  `;
}

export function textareaField(options: BaseField & { value?: string; rows?: number; placeholder?: string }): SafeHtml {
  const id = fieldId(options.name);
  return html`
    <div class="${cx('field', options.className)}">
      <label class="field__label" for="${id}">${options.label}${options.required ? html`<span class="field__req" aria-hidden="true"> *</span>` : ''}</label>
      <textarea class="input textarea" id="${id}" name="${options.name}" rows="${options.rows ?? 3}"
        ${options.placeholder ? html`placeholder="${options.placeholder}"` : ''} ${options.required ? 'required' : ''}>${options.value ?? ''}</textarea>
      ${options.hint ? html`<p class="field__hint">${options.hint}</p>` : ''}
    </div>
  `;
}

export interface SelectOption {
  value: string;
  label: string;
}

export function selectField(options: BaseField & { value?: string | null; options: SelectOption[]; emptyLabel?: string }): SafeHtml {
  const id = fieldId(options.name);
  return html`
    <div class="${cx('field', options.className)}">
      <label class="field__label" for="${id}">${options.label}${options.required ? html`<span class="field__req" aria-hidden="true"> *</span>` : ''}</label>
      <select class="input select" id="${id}" name="${options.name}" ${options.required ? 'required' : ''}>
        ${options.emptyLabel !== undefined ? html`<option value="">${options.emptyLabel}</option>` : ''}
        ${options.options.map((o) => html`<option value="${o.value}" ${o.value === options.value ? 'selected' : ''}>${o.label}</option>`)}
      </select>
      ${options.hint ? html`<p class="field__hint">${options.hint}</p>` : ''}
    </div>
  `;
}

/** Botões padrão do rodapé de um formulário em modal. */
export function formActions(submitLabel: string, extra?: SafeHtml): SafeHtml {
  return html`
    <footer class="form-actions">
      ${extra ?? html`<span></span>`}
      <div class="form-actions__main">
        <button type="button" class="btn btn--ghost" data-action="modal:close">Cancelar</button>
        <button type="submit" class="btn btn--primary">${submitLabel}</button>
      </div>
    </footer>
  `;
}
