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

// ---------------------------------------------------------------- Meses

/** Mês no formato AAAA-MM. */
export type MonthKey = string;

export function monthKey(value: ISODate): MonthKey {
  return value.slice(0, 7);
}

export function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

/** Soma meses mantendo o dia (ajusta para o último dia quando o mês é mais curto). */
export function addMonths(value: ISODate, months: number, day?: number): ISODate {
  const [y, m, d] = value.slice(0, 10).split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const wanted = day ?? d;
  return `${year}-${pad(month)}-${pad(Math.min(wanted, daysInMonth(year, month)))}`;
}

export function shiftMonth(key: MonthKey, months: number): MonthKey {
  return monthKey(addMonths(`${key}-01`, months));
}

export function firstDayOfMonth(key: MonthKey): ISODate {
  return `${key}-01`;
}

export function lastDayOfMonth(key: MonthKey): ISODate {
  const [y, m] = key.split('-').map(Number);
  return `${key}-${pad(daysInMonth(y, m))}`;
}

const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** "Novembro/2026". */
export function monthLabel(key: MonthKey): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]}/${y}`;
}

/** "novembro de 2026". */
export function monthLabelLong(key: MonthKey): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTH_NAMES[m - 1].toLowerCase()} de ${y}`;
}

export function isValidISODate(value: string | null | undefined): value is ISODate {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

/** Segunda-feira da semana de uma data (semana começando na segunda). */
export function startOfWeek(value: ISODate): ISODate {
  const date = parseISODate(value);
  const weekday = (date.getDay() + 6) % 7; // 0 = segunda
  return addDays(value, -weekday);
}
