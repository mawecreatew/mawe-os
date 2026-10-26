/**
 * Delegação de eventos.
 *
 * Em vez de ligar eventos em cada botão, os elementos declaram no HTML o que
 * fazem: `data-action="nome"` (clique), `data-change="nome"` (mudança em
 * campos), `data-input="nome"` (digitação) e `<form data-form="nome">` (envio).
 * Cada tela registra suas ações com `registerActions`.
 */

export type ActionHandler = (element: HTMLElement, event: Event) => void | Promise<void>;
export type FormHandler = (form: HTMLFormElement, values: FormValues, event: SubmitEvent) => void | Promise<void>;

const clickActions = new Map<string, ActionHandler>();
const formActions = new Map<string, FormHandler>();
let errorReporter: (error: unknown) => void = (error) => console.error(error);

export function registerActions(handlers: Record<string, ActionHandler>): void {
  for (const [name, handler] of Object.entries(handlers)) {
    if (clickActions.has(name)) throw new Error(`Ação duplicada: ${name}`);
    clickActions.set(name, handler);
  }
}

export function registerForms(handlers: Record<string, FormHandler>): void {
  for (const [name, handler] of Object.entries(handlers)) {
    if (formActions.has(name)) throw new Error(`Formulário duplicado: ${name}`);
    formActions.set(name, handler);
  }
}

export function onActionError(reporter: (error: unknown) => void): void {
  errorReporter = reporter;
}

async function run(fn: () => void | Promise<void>) {
  try {
    await fn();
  } catch (error) {
    errorReporter(error);
  }
}

/** Valores de um formulário com leitura tipada e sem espaços sobrando. */
export class FormValues {
  private readonly data: FormData;
  constructor(form: HTMLFormElement) {
    this.data = new FormData(form);
  }
  text(name: string): string {
    const value = this.data.get(name);
    return typeof value === 'string' ? value.trim() : '';
  }
  optional(name: string): string | null {
    return this.text(name) || null;
  }
  checked(name: string): boolean {
    return this.data.get(name) !== null;
  }
}

function dispatch(attribute: 'action' | 'change' | 'input', event: Event) {
  const target = event.target as HTMLElement | null;
  const element = target?.closest<HTMLElement>(`[data-${attribute}]`);
  if (!element) return;
  const name = element.dataset[attribute]!;
  const handler = clickActions.get(name);
  if (!handler) {
    console.warn(`Nenhuma ação registrada para "${name}"`);
    return;
  }
  if (attribute === 'action' && element.tagName === 'A' && !element.getAttribute('href')?.startsWith('#/')) {
    event.preventDefault();
  }
  void run(() => handler(element, event));
}

export function installEventDelegation(root: Document = document): void {
  root.addEventListener('click', (event) => dispatch('action', event));
  root.addEventListener('change', (event) => dispatch('change', event));
  root.addEventListener('input', (event) => dispatch('input', event));
  root.addEventListener('submit', (event) => {
    const form = event.target as HTMLFormElement;
    const name = form.dataset.form;
    if (!name) return;
    event.preventDefault();
    const handler = formActions.get(name);
    if (!handler) return console.warn(`Nenhum formulário registrado para "${name}"`);
    void run(() => handler(form, new FormValues(form), event as SubmitEvent));
  });
}
