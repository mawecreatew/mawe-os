/**
 * Entrega e pagamento de cada projeto: limite de artes e de rodadas de ajuste,
 * quanto tempo o cliente está com a prévia sem responder e quanto ainda falta
 * receber antes de publicar. Funções puras (testáveis).
 */
import { diffInDays, type ISODate } from '../core/dates.ts';
import { formatCurrency } from '../core/format.ts';
import { INCLUDED_REVISIONS, revisionRounds } from './approvals.ts';
import type { AppData, Client, ID, Installment, Project, ProjectLimits, Service } from './types.ts';

/** A partir de quantos dias sem resposta à prévia o sistema avisa. */
export const PREVIEW_ALERT_DAYS = 3;

export function serviceLimits(service: Service | undefined): ProjectLimits {
  return {
    arts: service?.includedArts ?? null,
    revisions: service?.includedRevisions ?? INCLUDED_REVISIONS,
    extraArtPrice: service?.extraArtPrice ?? null,
    extraRevisionPrice: service?.extraRevisionPrice ?? null,
  };
}

/** Os limites em frases curtas (para o card do serviço, a proposta e o contrato). */
export function limitsText(limits: ProjectLimits): string[] {
  const lines: string[] = [];
  if (limits.arts !== null) lines.push(limits.arts === 1 ? '1 arte incluída' : `${limits.arts} artes incluídas`);
  lines.push(limits.revisions === 1 ? '1 rodada de ajustes incluída' : `${limits.revisions} rodadas de ajustes incluídas`);
  if (limits.extraArtPrice !== null) lines.push(`Arte extra: ${formatCurrency(limits.extraArtPrice)} cada`);
  if (limits.extraRevisionPrice !== null) lines.push(`Rodada de ajustes extra: ${formatCurrency(limits.extraRevisionPrice)}`);
  return lines;
}

/** Limites do projeto: o que foi combinado nele ou, se nada, o do serviço do catálogo. */
export function projectLimits(data: Pick<AppData, 'services'>, project: Project): ProjectLimits {
  if (project.limits) return project.limits;
  return serviceLimits(data.services.find((s) => s.id === project.serviceId));
}

export interface LimitUsage {
  used: number;
  included: number | null;
  /** Já passou do que está incluído. */
  over: boolean;
  /** Chegou no limite (o próximo é extra). */
  atLimit: boolean;
  extraPrice: number | null;
}

export function limitUsage(data: AppData, project: Project): { arts: LimitUsage; revisions: LimitUsage } {
  const limits = projectLimits(data, project);
  const arts = project.artsUsed ?? 0;
  const rounds = revisionRounds(data, project.id);
  const usage = (used: number, included: number | null, extraPrice: number | null): LimitUsage => ({
    used,
    included,
    over: included !== null && used > included,
    atLimit: included !== null && used >= included,
    extraPrice,
  });
  return { arts: usage(arts, limits.arts, limits.extraArtPrice), revisions: usage(rounds, limits.revisions, limits.extraRevisionPrice) };
}

export function setProjectLimits(draft: AppData, projectId: ID, limits: ProjectLimits | null): void {
  const project = findProject(draft, projectId);
  if (limits) {
    for (const [key, value] of Object.entries(limits)) {
      if (value !== null && !(Number.isFinite(value) && value >= 0)) throw new Error('Os limites precisam ser números positivos.');
      if ((key === 'arts' || key === 'revisions') && value !== null && !Number.isInteger(value)) throw new Error('Use números inteiros para artes e rodadas.');
    }
  }
  project.limits = limits;
}

/** Soma ou tira uma arte entregue. */
export function changeArtsUsed(draft: AppData, projectId: ID, delta: number): void {
  const project = findProject(draft, projectId);
  project.artsUsed = Math.max(0, (project.artsUsed ?? 0) + delta);
}

// ---------------------------------------------------------------- Prévia

export interface PreviewWait {
  since: ISODate;
  days: number;
  /** Passou de 3 dias: hora de chamar o cliente. */
  alert: boolean;
}

/** Respostas do cliente que encerram a espera da prévia. */
const ANSWERS = ['previa', 'alteracao', 'entrega'];

/**
 * A prévia foi enviada e o cliente ainda não respondeu (nenhuma aprovação,
 * pedido de alteração ou entrega registrados depois do envio).
 */
export function previewWaiting(data: AppData, project: Project, today: ISODate): PreviewWait | null {
  const since = project.previewSentAt;
  if (!since || project.status === 'publicado') return null;
  const answered = (data.approvals ?? []).some((a) => a.projectId === project.id && ANSWERS.includes(a.kind) && a.date >= since);
  if (answered) return null;
  const days = Math.max(0, diffInDays(since, today));
  return { since, days, alert: days >= PREVIEW_ALERT_DAYS };
}

/** "Enviei a prévia": guarda o dia e deixa o projeto aguardando o cliente. */
export function markPreviewSent(draft: AppData, projectId: ID, today: ISODate): void {
  const project = findProject(draft, projectId);
  if (project.status === 'publicado') throw new Error('Este projeto já foi publicado.');
  project.previewSentAt = today;
  project.status = 'aguardando_cliente';
}

// ---------------------------------------------------------------- Pagamento

export interface ClientBalance {
  total: number;
  paid: number;
  open: number;
  openInstallments: Installment[];
}

export function clientBalance(client: Client | undefined): ClientBalance {
  const list = client?.installments ?? [];
  const total = list.reduce((s, i) => s + i.amount, 0);
  const openInstallments = list.filter((i) => !i.paidAt).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const open = openInstallments.reduce((s, i) => s + i.amount, 0);
  return { total, paid: total - open, open, openInstallments };
}

/** O cliente aprovou a prévia, mas ainda falta receber antes de publicar. */
export function finalPaymentPending(data: AppData, project: Project): boolean {
  if (project.status === 'publicado' || (project.type !== 'site' && project.type !== 'sistema')) return false;
  const approved = (data.approvals ?? []).some((a) => a.projectId === project.id && a.kind === 'previa');
  return approved && clientBalance(data.clients.find((c) => c.id === project.clientId)).open > 0;
}

function findProject(draft: AppData, id: ID): Project {
  const project = draft.projects.find((p) => p.id === id);
  if (!project) throw new Error('Projeto não encontrado.');
  return project;
}

// ---------------------------------------------------------------- Avisos

export interface DeliveryAlert {
  kind: 'preview' | 'payment';
  project: Project;
  client: Client | undefined;
  /** Dia em que o aviso começou. */
  date: ISODate;
  days: number;
}

/** Clientes sem responder a prévia há 3 dias ou mais e pagamentos finais a cobrar. */
export function deliveryAlerts(data: AppData, today: ISODate): DeliveryAlert[] {
  const list: DeliveryAlert[] = [];
  for (const project of data.projects) {
    const client = data.clients.find((c) => c.id === project.clientId);
    const wait = previewWaiting(data, project, today);
    if (wait?.alert) list.push({ kind: 'preview', project, client, date: wait.since, days: wait.days });
    if (finalPaymentPending(data, project)) {
      const approved = (data.approvals ?? []).filter((a) => a.projectId === project.id && a.kind === 'previa').map((a) => a.date).sort().at(-1) ?? today;
      list.push({ kind: 'payment', project, client, date: approved, days: Math.max(0, diffInDays(approved, today)) });
    }
  }
  return list;
}
