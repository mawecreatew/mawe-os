const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const currencyCents = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatCurrency(value: number, withCents = false): string {
  return (withCents ? currencyCents : currency).format(value);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Remove acentos e deixa minúsculo — útil para busca e classificação de texto. */
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Converte valores digitados em número: "1.500,50", "2.000", "R$ 3.200" ou "1500.5".
 * Retorna null se vazio ou inválido.
 */
export function parseMoney(input: string): number | null {
  const cleaned = input.replace(/[^\d.,-]/g, '');
  if (!/\d/.test(cleaned)) return null;
  let normalized: string;
  if (cleaned.includes(',')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.'); // padrão brasileiro
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, ''); // "2.000" = dois mil
  } else {
    normalized = cleaned;
  }
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
