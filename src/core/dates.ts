/**
 * Datas no formato ISO curto (AAAA-MM-DD), sempre no fuso local.
 * Guardar só a data evita surpresas com fuso horário em prazos.
 */

export type ISODate = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(date: Date): ISODate {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseISODate(value: ISODate): Date {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function addDays(value: ISODate, days: number): ISODate {
  const date = parseISODate(value);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Diferença em dias inteiros: positivo quando `to` está no futuro. */
export function diffInDays(from: ISODate, to: ISODate): number {
  const ms = parseISODate(to).getTime() - parseISODate(from).getTime();
  return Math.round(ms / 86_400_000);
}

const shortFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });
const longFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
const weekdayFormatter = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

export function formatShortDate(value: ISODate): string {
  return shortFormatter.format(parseISODate(value)).replace('.', '');
}

export function formatLongDate(value: ISODate): string {
  return longFormatter.format(parseISODate(value));
}

export function formatWeekday(value: ISODate): string {
  const text = weekdayFormatter.format(parseISODate(value));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** "hoje", "amanhã", "em 3 dias", "há 2 dias". */
export function relativeDay(value: ISODate, today: ISODate): string {
  const diff = diffInDays(today, value);
  if (diff === 0) return 'hoje';
  if (diff === 1) return 'amanhã';
  if (diff === -1) return 'ontem';
  if (diff > 1) return `em ${diff} dias`;
  return `há ${Math.abs(diff)} dias`;
}

export function nowTimestamp(now: Date = new Date()): string {
  return now.toISOString();
}

const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatTimestamp(value: string): string {
  return dateTimeFormatter.format(new Date(value)).replace('.', '');
}
