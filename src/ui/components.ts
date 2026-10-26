/** Componentes visuais reutilizáveis. Cada função devolve um trecho de HTML seguro. */
import { diffInDays, formatShortDate, relativeDay, type ISODate } from '../core/dates.ts';
import { initials } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import type { Tone } from '../domain/labels.ts';
import { peopleNames } from '../domain/people.ts';
import type { AppData, ID, User } from '../domain/types.ts';
import { icon, type IconName } from './icons.ts';

export function badge(label: string, tone: Tone = 'neutral', extraClass = ''): SafeHtml {
  return html`<span class="${cx('badge', `badge--${tone}`, extraClass)}">${label}</span>`;
}

/** Selo discreto para registros fictícios. */
export function demoTag(item: { isDemo?: boolean }): SafeHtml {
  return item.isDemo ? html`<span class="demo-tag" title="Registro fictício de demonstração">demo</span>` : html``;
}

export function avatar(user: User | undefined, size: 'sm' | 'md' = 'sm'): SafeHtml {
  if (!user) return html`<span class="avatar avatar--${size} avatar--empty" title="Sem responsável">—</span>`;
  return html`<span class="${cx('avatar', `avatar--${size}`, `avatar--${user.id}`, user.guest && 'avatar--guest')}" title="${user.name}">${initials(user.name)}</span>`;
}

/** Avatares sobrepostos de um ou mais responsáveis. */
export function avatarStack(data: AppData, ids: readonly ID[] | undefined, size: 'sm' | 'md' = 'sm'): SafeHtml {
  const users = (ids ?? []).map((id) => data.users.find((u) => u.id === id)).filter((u): u is User => Boolean(u));
  if (!users.length) return avatar(undefined, size);
  if (users.length === 1) return avatar(users[0], size);
  return html`<span class="avatar-stack" title="${peopleNames(data, ids)}">${users.map((u) => avatar(u, size))}</span>`;
}

/** Avatares + nomes ("Maria e Wesley"). */
export function people(data: AppData, ids: readonly ID[] | undefined): SafeHtml {
  return html`<span class="person">${avatarStack(data, ids)}<span>${peopleNames(data, ids)}</span></span>`;
}

export function person(user: User | undefined): SafeHtml {
  return html`<span class="person">${avatar(user)}<span>${user?.shortName ?? 'Sem responsável'}</span></span>`;
}

export function pageHeader(options: {
  title: string;
  subtitle?: string | SafeHtml;
  actions?: SafeHtml;
  back?: { href: string; label: string };
}): SafeHtml {
  return html`
    <header class="page-header">
      <div class="page-header__text">
        ${options.back
          ? html`<a class="back-link" href="${options.back.href}">${icon('arrowLeft', 16)} ${options.back.label}</a>`
          : ''}
        <h1 class="page-title">${options.title}</h1>
        ${options.subtitle ? html`<p class="page-subtitle">${options.subtitle}</p>` : ''}
      </div>
      ${options.actions ? html`<div class="page-header__actions">${options.actions}</div>` : ''}
    </header>
  `;
}

export function panel(options: {
  title: string;
  icon?: IconName;
  action?: SafeHtml;
  body: SafeHtml;
  className?: string;
  count?: number;
}): SafeHtml {
  return html`
    <section class="${cx('panel', options.className)}">
      <header class="panel__header">
        <h2 class="panel__title">
          ${options.icon ? icon(options.icon, 17) : ''} ${options.title}
          ${options.count !== undefined ? html`<span class="panel__count">${options.count}</span>` : ''}
        </h2>
        ${options.action ?? ''}
      </header>
      <div class="panel__body">${options.body}</div>
    </section>
  `;
}

export function emptyState(options: { icon: IconName; title: string; text?: string; action?: SafeHtml; compact?: boolean }): SafeHtml {
  return html`
    <div class="${cx('empty-state', options.compact && 'empty-state--compact')}">
      <span class="empty-state__icon">${icon(options.icon, options.compact ? 20 : 26)}</span>
      <p class="empty-state__title">${options.title}</p>
      ${options.text ? html`<p class="empty-state__text">${options.text}</p>` : ''}
      ${options.action ?? ''}
    </div>
  `;
}

export function button(options: {
  label: string;
  action?: string;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  data?: Record<string, string>;
  type?: 'button' | 'submit';
  size?: 'sm' | 'md';
  title?: string;
  iconOnly?: boolean;
}): SafeHtml {
  const data = Object.entries(options.data ?? {})
    .map(([k, v]) => html` data-${k}="${v}"`);
  return html`<button type="${options.type ?? 'button'}"
      class="${cx('btn', `btn--${options.variant ?? 'secondary'}`, options.size === 'sm' && 'btn--sm', options.iconOnly && 'btn--icon')}"
      ${options.action ? html`data-action="${options.action}"` : ''}${data}
      ${options.title || options.iconOnly ? html`title="${options.title ?? options.label}" aria-label="${options.title ?? options.label}"` : ''}>
      ${options.icon ? icon(options.icon, 16) : ''}${options.iconOnly ? '' : html`<span>${options.label}</span>`}
    </button>`;
}

export function progressBar(value: number, label?: string): SafeHtml {
  const clamped = Math.max(0, Math.min(100, value));
  return html`
    <div class="progress" role="progressbar" aria-valuenow="${clamped}" aria-valuemin="0" aria-valuemax="100" aria-label="${label ?? 'Progresso'}">
      <span class="progress__bar" style="width: ${clamped}%"></span>
    </div>
  `;
}

/** Prazo com destaque: atrasado (vermelho), hoje/amanhã (âmbar), demais (neutro). */
export function dueDate(date: ISODate | null, today: ISODate, done = false): SafeHtml {
  if (!date) return html`<span class="due due--none">Sem prazo</span>`;
  const diff = diffInDays(today, date);
  const tone = done ? 'done' : diff < 0 ? 'overdue' : diff <= 1 ? 'soon' : 'normal';
  const text = done ? formatShortDate(date) : diff < 0 ? `Atrasada · ${formatShortDate(date)}` : `${formatShortDate(date)} · ${relativeDay(date, today)}`;
  return html`<span class="due due--${tone}">${icon('calendar', 14)} ${text}</span>`;
}

export function statCard(options: { label: string; value: string; hint?: string | SafeHtml; href?: string; tone?: Tone }): SafeHtml {
  const inner = html`
    <span class="stat__label">${options.label}</span>
    <span class="stat__value">${options.value}</span>
    ${options.hint ? html`<span class="stat__hint">${options.hint}</span>` : ''}
  `;
  return options.href
    ? html`<a class="${cx('stat', options.tone && `stat--${options.tone}`)}" href="${options.href}">${inner}</a>`
    : html`<div class="${cx('stat', options.tone && `stat--${options.tone}`)}">${inner}</div>`;
}

export function segmented(options: { action: string; value: string; items: Array<{ value: string; label: string; icon?: IconName; count?: number }>; label: string }): SafeHtml {
  return html`
    <div class="segmented" role="tablist" aria-label="${options.label}">
      ${options.items.map(
        (item) => html`<button type="button" role="tab" class="${cx('segmented__item', item.value === options.value && 'is-active')}"
            aria-selected="${item.value === options.value ? 'true' : 'false'}"
            data-action="${options.action}" data-value="${item.value}">
            ${item.icon ? icon(item.icon, 15) : ''}<span>${item.label}</span>
            ${item.count !== undefined ? html`<span class="segmented__count">${item.count}</span>` : ''}
          </button>`,
      )}
    </div>
  `;
}

export function notice(options: { tone?: 'info' | 'warning'; title: string; text?: string | SafeHtml; icon?: IconName }): SafeHtml {
  return html`
    <div class="notice notice--${options.tone ?? 'info'}" role="note">
      <span class="notice__icon">${icon(options.icon ?? 'info', 18)}</span>
      <div>
        <p class="notice__title">${options.title}</p>
        ${options.text ? html`<p class="notice__text">${options.text}</p>` : ''}
      </div>
    </div>
  `;
}

export function externalLink(href: string, label: string): SafeHtml {
  const safe = /^https?:\/\//i.test(href) ? href : `https://${href}`;
  return html`<a class="ext-link" href="${safe}" target="_blank" rel="noopener noreferrer">${label} ${icon('external', 13)}</a>`;
}
