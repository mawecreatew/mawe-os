/** Modal (janela sobreposta), confirmação e avisos rápidos (toasts). */
import { registerActions } from '../core/events.ts';
import { html, type SafeHtml } from '../core/html.ts';
import { icon } from './icons.ts';

let dialog: HTMLDialogElement | null = null;

function ensureDialog(): HTMLDialogElement {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'modal';
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) closeModal(); // clique fora do conteúdo
  });
  document.body.append(dialog);
  return dialog;
}

export function openModal(options: { title: string; body: SafeHtml; size?: 'md' | 'lg'; description?: string }): void {
  const el = ensureDialog();
  el.className = `modal modal--${options.size ?? 'md'}`;
  el.setAttribute('aria-label', options.title);
  el.innerHTML = html`
    <div class="modal__content">
      <header class="modal__header">
        <div>
          <h2 class="modal__title">${options.title}</h2>
          ${options.description ? html`<p class="modal__description">${options.description}</p>` : ''}
        </div>
        <button type="button" class="btn btn--ghost btn--icon" data-action="modal:close" aria-label="Fechar">${icon('close')}</button>
      </header>
      <div class="modal__body">${options.body}</div>
    </div>
  `.value;
  if (!el.open) el.showModal();
  el.querySelector<HTMLElement>('[autofocus], input, select, textarea')?.focus();
}

export function closeModal(): void {
  if (dialog?.open) dialog.close();
}

let confirmResolver: ((value: boolean) => void) | null = null;

export function confirmAction(options: { title: string; text: string; confirmLabel?: string }): Promise<boolean> {
  return new Promise((resolve) => {
    confirmResolver = resolve;
    openModal({
      title: options.title,
      body: html`
        <p class="confirm-text">${options.text}</p>
        <footer class="form-actions">
          <span></span>
          <div class="form-actions__main">
            <button type="button" class="btn btn--ghost" data-action="confirm:no">Cancelar</button>
            <button type="button" class="btn btn--danger" data-action="confirm:yes">${options.confirmLabel ?? 'Confirmar'}</button>
          </div>
        </footer>
      `,
    });
    dialog?.addEventListener(
      'close',
      () => {
        confirmResolver?.(false);
        confirmResolver = null;
      },
      { once: true },
    );
  });
}

function answerConfirm(value: boolean) {
  const resolver = confirmResolver;
  confirmResolver = null;
  resolver?.(value);
  closeModal();
}

let toastRoot: HTMLElement | null = null;

export function toast(message: string, tone: 'success' | 'error' | 'info' = 'success'): void {
  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.className = 'toasts';
    toastRoot.setAttribute('role', 'status');
    toastRoot.setAttribute('aria-live', 'polite');
    document.body.append(toastRoot);
  }
  const item = document.createElement('div');
  item.className = `toast toast--${tone}`;
  item.innerHTML = html`${icon(tone === 'error' ? 'alert' : tone === 'info' ? 'info' : 'check', 16)}<span>${message}</span>`.value;
  toastRoot.append(item);
  setTimeout(() => item.classList.add('is-leaving'), 3200);
  setTimeout(() => item.remove(), 3600);
}

registerActions({
  'modal:close': () => closeModal(),
  'confirm:yes': () => answerConfirm(true),
  'confirm:no': () => answerConfirm(false),
});
