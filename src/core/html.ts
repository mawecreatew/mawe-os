/**
 * Template de HTML seguro.
 *
 * Todo valor interpolado em `html\`...\`` é escapado automaticamente, o que
 * impede que um texto digitado pelo usuário vire código (XSS). Para inserir
 * um trecho que já é HTML confiável (por exemplo, outro template ou um ícone),
 * passe um `SafeHtml` — resultado de `html` ou `raw`.
 */

export class SafeHtml {
  readonly value: string;
  constructor(value: string) {
    this.value = value;
  }
  toString(): string {
    return this.value;
  }
}

type Interpolation = SafeHtml | string | number | boolean | null | undefined | Interpolation[];

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

function serialize(value: Interpolation): string {
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(serialize).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: Interpolation[]): SafeHtml {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) {
    out += serialize(values[i]) + strings[i + 1];
  }
  return new SafeHtml(out);
}

/** Marca um texto como HTML confiável. Use apenas com conteúdo do próprio código. */
export function raw(trusted: string): SafeHtml {
  return new SafeHtml(trusted);
}

/** Converte quebras de linha de um texto livre em <br>, mantendo o escape. */
export function multiline(text: string): SafeHtml {
  return new SafeHtml(escapeHtml(text).replace(/\n/g, '<br>'));
}

/** Junta classes CSS ignorando valores vazios. */
export function cx(...classes: Array<string | false | 0 | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
