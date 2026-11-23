/**
 * Pós-venda: contatos combinados depois que o site é entregue (7 dias, 30 dias
 * e a cada 3 meses no primeiro ano). A renovação do domínio já aparece no
 * Foco de hoje pela ficha do cliente.
 */
import { addDays, type ISODate } from '../core/dates.ts';
import { logActivity } from './activity.ts';
import type { ActionContext } from './operations.ts';
import type { AppData, Client, ID, Project } from './types.ts';

export interface AfterSalesPoint {
  /** Chave do marco com o dia da entrega (ex.: `d7@2026-11-20`). */
  key: string;
  label: string;
  /** O que fazer neste contato. */
  action: string;
  date: ISODate;
  /** Dia em que foi feito (null = ainda não). */
  doneOn: ISODate | null;
  /** Mensagem da Biblioteca sugerida para este contato. */
  messageId: ID;
}

const MARKS: Array<{ key: string; days: number; label: string; action: string; messageId: ID }> = [
  { key: 'd7', days: 7, label: '7 dias', action: 'Perguntar se está tudo certo e pedir depoimento', messageId: 'lib_posvenda_7' },
  { key: 'd30', days: 30, label: '30 dias', action: 'Ver se o site está trazendo contatos e oferecer extras', messageId: 'lib_posvenda_30' },
  { key: 'd90', days: 90, label: '3 meses', action: 'Mensagem leve de acompanhamento', messageId: 'lib_posvenda_90' },
  { key: 'd180', days: 180, label: '6 meses', action: 'Mensagem leve de acompanhamento', messageId: 'lib_posvenda_90' },
  { key: 'd270', days: 270, label: '9 meses', action: 'Mensagem leve de acompanhamento', messageId: 'lib_posvenda_90' },
  { key: 'd365', days: 365, label: '1 ano', action: 'Um ano de site: sugerir melhorias', messageId: 'lib_posvenda_90' },
];

/** Projetos que já foram entregues (publicados), com o dia da entrega. */
function deliveredProjects(data: AppData, clientId: ID): Array<{ project: Project; on: ISODate }> {
  return data.projects
    .filter((p) => p.clientId === clientId && p.status === 'publicado' && p.type !== 'plano_mensal')
    .map((p) => ({ project: p, on: p.publishedAt ?? p.dueDate }))
    .sort((a, b) => b.on.localeCompare(a.on));
}

/** Dia que começa o pós-venda: a entrega mais recente do cliente. */
export function afterSalesStart(data: AppData, clientId: ID): ISODate | null {
  return deliveredProjects(data, clientId)[0]?.on ?? null;
}

export function afterSalesPoints(data: AppData, client: Client): AfterSalesPoint[] {
  const done = client.afterSales ?? {};
  const start = afterSalesStart(data, client.id);
  const points: AfterSalesPoint[] = [];
  if (start) {
    // A chave inclui o dia da entrega: um site novo para o mesmo cliente recomeça o calendário.
    for (const m of MARKS) {
      const key = `${m.key}@${start}`;
      points.push({ key, label: m.label, action: m.action, date: addDays(start, m.days), doneOn: done[key] ?? null, messageId: m.messageId });
    }
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Próximo contato do calendário de pós-venda. Marcos antigos que passaram sem
 * ninguém fazer (ex.: site entregue antes desta função existir) são pulados:
 * vale o mais recente que já venceu, ou o próximo que vai vencer.
 */
export function nextAfterSales(data: AppData, client: Client, today: ISODate): AfterSalesPoint | null {
  const series = afterSalesPoints(data, client);
  const lastDone = series.reduce((acc, p, i) => (p.doneOn ? i : acc), -1);
  const open = series.slice(lastDone + 1);
  const due = open.filter((p) => p.date <= today);
  return due[due.length - 1] ?? open[0] ?? null;
}

/** Contatos de pós-venda que vencem até `until` (para o Foco de hoje): o próximo de cada cliente. */
export function afterSalesDue(data: AppData, today: ISODate, until: ISODate): Array<{ client: Client; point: AfterSalesPoint }> {
  const out: Array<{ client: Client; point: AfterSalesPoint }> = [];
  for (const client of data.clients) {
    const point = nextAfterSales(data, client, today);
    if (point && point.date <= until) out.push({ client, point });
  }
  return out;
}

export function markAfterSales(draft: AppData, clientId: ID, key: string, on: ISODate | null, ctx: ActionContext): void {
  const client = draft.clients.find((c) => c.id === clientId);
  if (!client) throw new Error('Cliente não encontrado.');
  const map = { ...(client.afterSales ?? {}) };
  if (on) map[key] = on;
  else delete map[key];
  client.afterSales = map;
  if (on) logActivity(draft, ctx, `fez o contato de pós-venda com ${client.company}`, `#/clientes/${client.id}`);
}
