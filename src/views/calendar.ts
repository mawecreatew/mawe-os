/** Calendário de conteúdo: posts, feed e stories dos clientes e da própria MaweCreate. */
import { addDays, formatShortDate, monthKey, monthLabel, parseISODate, shiftMonth, startOfWeek, type ISODate } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { pluralize } from '../core/format.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import {
  AGENCY_FILTER,
  contentColorIndex,
  contentsInRange,
  deleteContent,
  monthGrid,
  saveContent,
  setContentStatus,
  type ContentInput,
} from '../domain/business.ts';
import { CONTENT_FORMATS, CONTENT_NETWORKS, CONTENT_STATUSES, labelOf, toneOf } from '../domain/labels.ts';
import type { AppData, ContentItem, ContentStatus, ID } from '../domain/types.ts';
import { requirePermission, rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { button, demoTag, emptyState, externalLink, pageHeader, segmented } from '../ui/components.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

const ui = {
  mode: 'mes' as 'mes' | 'semana',
  /** Data de referência (qualquer dia do mês/semana exibido). */
  anchor: null as ISODate | null,
  client: 'todos',
  colorBy: 'cliente' as 'cliente' | 'status',
};

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WEEKDAYS_LONG = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];

function anchor(): ISODate {
  return ui.anchor ?? today();
}

function clientName(data: AppData, clientId: ID | null): string {
  if (!clientId) return 'MaweCreate';
  return data.clients.find((c) => c.id === clientId)?.company ?? 'Cliente removido';
}

/** Projetos que podem ter conteúdos (plano mensal e pacote de conteúdo). */
function contentProjects(data: AppData) {
  return data.projects.filter((p) => p.type === 'plano_mensal' || p.type === 'pacote_conteudo');
}

// ---------------------------------------------------------------- Formulário

export function openContentForm(item?: ContentItem, preset: { date?: ISODate; clientId?: ID | null; projectId?: ID | null } = {}): void {
  const { data } = store();
  const v: ContentInput = item ?? {
    title: '',
    clientId: preset.clientId ?? (ui.client !== 'todos' && ui.client !== AGENCY_FILTER ? ui.client : null),
    projectId: preset.projectId ?? null,
    date: preset.date ?? today(),
    time: '',
    network: 'Instagram',
    format: 'Post no feed',
    caption: '',
    artLink: '',
    notes: '',
    status: 'ideia',
  };
  const projects = contentProjects(data);
  openModal({
    title: item ? 'Editar conteúdo' : 'Novo conteúdo',
    size: 'lg',
    body: html`
      <form class="form" data-form="content:save" data-id="${item?.id ?? ''}">
        ${textField({ name: 'title', label: 'Tema do conteúdo', value: v.title, required: true, autofocus: true, placeholder: 'Ex.: Promoção de pizza de quinta' })}
        <div class="form-grid">
          ${selectField({
            name: 'clientId',
            label: 'De quem é',
            value: v.clientId ?? '',
            options: [{ value: '', label: 'MaweCreate (nosso Instagram)' }, ...[...data.clients].sort((a, b) => a.company.localeCompare(b.company)).map((c) => ({ value: c.id, label: c.company }))],
          })}
          ${selectField({
            name: 'projectId',
            label: 'Projeto (plano ou pacote)',
            value: v.projectId ?? '',
            emptyLabel: 'Nenhum',
            options: projects.map((p) => ({ value: p.id, label: `${p.name} · ${clientName(data, p.clientId)}` })),
            hint: 'Só vale se for do mesmo cliente.',
          })}
          ${textField({ name: 'date', label: 'Data', type: 'date', value: v.date, required: true })}
          ${textField({ name: 'time', label: 'Horário', type: 'time', value: v.time })}
          ${selectField({ name: 'network', label: 'Rede social', value: v.network, options: [...new Set([...CONTENT_NETWORKS, v.network])].map((n) => ({ value: n, label: n })) })}
          ${selectField({ name: 'format', label: 'Formato', value: v.format, options: [...new Set([...CONTENT_FORMATS, v.format])].map((n) => ({ value: n, label: n })) })}
          ${selectField({ name: 'status', label: 'Status', value: v.status, options: CONTENT_STATUSES })}
          ${textField({ name: 'artLink', label: 'Arte (link do Canva/Drive)', value: v.artLink, placeholder: 'canva.com/...' })}
        </div>
        ${textareaField({ name: 'caption', label: 'Legenda', value: v.caption, rows: 4 })}
        ${textareaField({ name: 'notes', label: 'Observações', value: v.notes, rows: 2 })}
        ${formActions(item ? 'Salvar conteúdo' : 'Adicionar ao calendário', item ? button({ label: 'Excluir', action: 'content:delete', variant: 'ghost', icon: 'trash', data: { id: item.id } }) : undefined)}
      </form>
    `,
  });
}

registerForms({
  'content:save': async (form, values) => {
    requirePermission('projects:edit');
    const input: ContentInput = {
      title: values.text('title'),
      clientId: values.optional('clientId'),
      projectId: values.optional('projectId'),
      date: values.text('date'),
      time: values.text('time'),
      network: values.text('network'),
      format: values.text('format'),
      status: values.text('status') as ContentStatus,
      artLink: values.text('artLink'),
      caption: values.text('caption'),
      notes: values.text('notes'),
    };
    if (input.projectId) {
      const project = store().data.projects.find((p) => p.id === input.projectId);
      if (project && project.clientId !== input.clientId) throw new Error('O projeto escolhido é de outro cliente. Troque o cliente ou o projeto.');
    }
    const id = form.dataset.id || null;
    await store().apply((draft, ctx) => saveContent(draft, id, input, ctx));
    closeModal();
    toast(id ? 'Conteúdo atualizado.' : 'Conteúdo adicionado ao calendário.');
  },
});

registerActions({
  'content:new': (el) => openContentForm(undefined, { date: el.dataset.date, clientId: el.dataset.client || undefined, projectId: el.dataset.project || undefined }),
  'content:edit': (el) => {
    const item = store().data.contents.find((c) => c.id === el.dataset.id);
    if (item) openContentForm(item);
  },
  'content:delete': async (el) => {
    const ok = await confirmAction({ title: 'Excluir conteúdo', text: 'Este conteúdo será removido do calendário.', confirmLabel: 'Excluir' });
    if (!ok) return;
    await store().apply((draft) => deleteContent(draft, el.dataset.id!));
    toast('Conteúdo excluído.');
  },
  'content:status': async (el) => {
    requirePermission('projects:edit');
    const status = (el as HTMLSelectElement).value as ContentStatus;
    await store().apply((draft) => setContentStatus(draft, el.dataset.id!, status));
    toast(`Marcado como "${labelOf(CONTENT_STATUSES, status)}".`);
  },
  'calendar:mode': (el) => {
    ui.mode = el.dataset.value as typeof ui.mode;
    rerender();
  },
  'calendar:color': (el) => {
    ui.colorBy = el.dataset.value as typeof ui.colorBy;
    rerender();
  },
  'calendar:client': (el) => {
    ui.client = (el as HTMLSelectElement).value;
    rerender();
  },
  'calendar:prev': () => {
    ui.anchor = ui.mode === 'mes' ? `${shiftMonth(monthKey(anchor()), -1)}-01` : addDays(anchor(), -7);
    rerender();
  },
  'calendar:next': () => {
    ui.anchor = ui.mode === 'mes' ? `${shiftMonth(monthKey(anchor()), 1)}-01` : addDays(anchor(), 7);
    rerender();
  },
  'calendar:today': () => {
    ui.anchor = null;
    rerender();
  },
});

// ---------------------------------------------------------------- Renderização

function colorClass(data: AppData, item: ContentItem): string {
  return ui.colorBy === 'status' ? `tone--${toneOf(CONTENT_STATUSES, item.status)}` : `cal-c${contentColorIndex(data, item.clientId)}`;
}

function chip(data: AppData, item: ContentItem): SafeHtml {
  return html`<button type="button" class="${cx('cal-item', colorClass(data, item), item.status === 'postado' && 'is-posted')}" data-action="content:edit" data-id="${item.id}"
    title="${item.title} · ${clientName(data, item.clientId)} · ${labelOf(CONTENT_STATUSES, item.status)}">
    ${item.time ? html`<span class="cal-item__time">${item.time}</span>` : ''}<span class="cal-item__title">${item.title}</span>
  </button>`;
}

function renderMonth(data: AppData, items: ContentItem[]): SafeHtml {
  const month = monthKey(anchor());
  const t = today();
  return html`<div class="cal-month" role="grid" aria-label="Calendário de ${monthLabel(month)}">
    <div class="cal-month__head" role="row">${WEEKDAYS.map((d) => html`<span role="columnheader">${d}</span>`)}</div>
    ${monthGrid(month).map(
      (week) => html`<div class="cal-month__week" role="row">
        ${week.map((day) => {
          const dayItems = items.filter((c) => c.date === day);
          return html`<div class="${cx('cal-day', monthKey(day) !== month && 'is-out', day === t && 'is-today')}" role="gridcell">
            <div class="cal-day__head">
              <span class="cal-day__num">${String(parseISODate(day).getDate())}</span>
              <button type="button" class="cal-day__add" data-action="content:new" data-date="${day}" aria-label="Novo conteúdo em ${formatShortDate(day)}">${icon('plus', 13)}</button>
            </div>
            <div class="cal-day__items">${dayItems.slice(0, 4).map((c) => chip(data, c))}${dayItems.length > 4 ? html`<span class="cal-more">+${dayItems.length - 4}</span>` : ''}</div>
          </div>`;
        })}
      </div>`,
    )}
  </div>`;
}

function renderWeek(data: AppData, items: ContentItem[], start: ISODate): SafeHtml {
  const t = today();
  return html`<div class="cal-week">
    ${WEEKDAYS_LONG.map((name, i) => {
      const day = addDays(start, i);
      const dayItems = items.filter((c) => c.date === day);
      return html`<section class="${cx('cal-week__day', day === t && 'is-today')}" aria-label="${name}, ${formatShortDate(day)}">
        <header class="cal-week__head">
          <span><strong>${name}</strong> <span class="muted">${formatShortDate(day)}</span></span>
          <button type="button" class="cal-day__add" data-action="content:new" data-date="${day}" aria-label="Novo conteúdo em ${formatShortDate(day)}">${icon('plus', 14)}</button>
        </header>
        ${dayItems.length
          ? dayItems.map(
              (c) => html`<article class="${cx('cal-card', colorClass(data, c))}">
                <button type="button" class="cal-card__main" data-action="content:edit" data-id="${c.id}">
                  <span class="cal-card__meta">${c.time || 'Sem horário'} · ${c.format} · ${c.network}</span>
                  <span class="cal-card__title">${c.title}</span>
                  <span class="cal-card__client">${clientName(data, c.clientId)} ${demoTag(c)}</span>
                  ${c.caption ? html`<span class="cal-card__caption">${multiline(c.caption.length > 120 ? `${c.caption.slice(0, 120)}…` : c.caption)}</span>` : ''}
                </button>
                <div class="cal-card__foot">
                  <label class="visually-hidden" for="cs-${c.id}">Status de ${c.title}</label>
                  <select id="cs-${c.id}" class="input select select--inline" data-change="content:status" data-id="${c.id}">
                    ${CONTENT_STATUSES.map((s) => html`<option value="${s.value}" ${s.value === c.status ? 'selected' : ''}>${s.label}</option>`)}
                  </select>
                  ${c.artLink ? externalLink(c.artLink, 'Arte') : ''}
                </div>
              </article>`,
            )
          : html`<p class="cal-week__empty">—</p>`}
      </section>`;
    })}
  </div>`;
}

function legend(data: AppData, items: ContentItem[]): SafeHtml {
  if (ui.colorBy === 'status') {
    return html`<div class="cal-legend">${CONTENT_STATUSES.map((s) => html`<span class="cal-legend__item"><i class="tone--${s.tone}"></i>${s.label}</span>`)}</div>`;
  }
  const ids = [...new Set(items.map((c) => c.clientId))];
  if (!ids.length) return html``;
  return html`<div class="cal-legend">${ids.map((id) => html`<span class="cal-legend__item"><i class="cal-c${contentColorIndex(data, id)}"></i>${clientName(data, id)}</span>`)}</div>`;
}

export const calendarView: View = {
  title: () => 'Calendário de conteúdo',
  render: () => {
    const { data } = store();
    const ref = anchor();
    const weekStart = startOfWeek(ref);
    const month = monthKey(ref);
    const range: [ISODate, ISODate] = ui.mode === 'mes' ? [monthGrid(month)[0][0], monthGrid(month).at(-1)![6]] : [weekStart, addDays(weekStart, 6)];
    const items = contentsInRange(data, range[0], range[1], ui.client);
    const inPeriod = ui.mode === 'mes' ? items.filter((c) => monthKey(c.date) === month) : items;
    const pending = inPeriod.filter((c) => c.status === 'aguardando_aprovacao').length;
    const clientsWithContent = [...data.clients]
      .filter((c) => data.contents.some((x) => x.clientId === c.id) || data.projects.some((p) => p.clientId === c.id && (p.type === 'plano_mensal' || p.type === 'pacote_conteudo')) || c.id === ui.client)
      .sort((a, b) => a.company.localeCompare(b.company));
    const title = ui.mode === 'mes' ? monthLabel(month) : `${formatShortDate(weekStart)} – ${formatShortDate(addDays(weekStart, 6))}`;

    return html`
      ${pageHeader({
        title: 'Calendário de conteúdo',
        subtitle: `${pluralize(inPeriod.length, 'conteúdo', 'conteúdos')} ${ui.mode === 'mes' ? 'no mês' : 'na semana'}${pending ? ` · ${pluralize(pending, 'aguardando aprovação', 'aguardando aprovação')}` : ''}`,
        actions: button({ label: 'Novo conteúdo', action: 'content:new', variant: 'primary', icon: 'plus' }),
      })}
      <div class="toolbar">
        <div class="period-nav">
          ${button({ label: ui.mode === 'mes' ? 'Mês anterior' : 'Semana anterior', iconOnly: true, icon: 'arrowLeft', action: 'calendar:prev' })}
          <strong class="period-nav__label">${title}</strong>
          ${button({ label: ui.mode === 'mes' ? 'Próximo mês' : 'Próxima semana', iconOnly: true, icon: 'arrowRight', action: 'calendar:next' })}
          ${button({ label: 'Hoje', action: 'calendar:today', size: 'sm', variant: 'ghost' })}
        </div>
        ${segmented({ label: 'Visualização', action: 'calendar:mode', value: ui.mode, items: [{ value: 'mes', label: 'Mês', icon: 'calendar' }, { value: 'semana', label: 'Semana', icon: 'list' }] })}
        <label class="toolbar__select">
          <span class="visually-hidden">Filtrar por cliente</span>
          <select class="input select select--inline" data-change="calendar:client" aria-label="Filtrar por cliente">
            <option value="todos" ${ui.client === 'todos' ? 'selected' : ''}>Todos os clientes</option>
            <option value="${AGENCY_FILTER}" ${ui.client === AGENCY_FILTER ? 'selected' : ''}>MaweCreate</option>
            ${clientsWithContent.map((c) => html`<option value="${c.id}" ${ui.client === c.id ? 'selected' : ''}>${c.company}</option>`)}
          </select>
        </label>
        ${segmented({ label: 'Cores', action: 'calendar:color', value: ui.colorBy, items: [{ value: 'cliente', label: 'Cor por cliente' }, { value: 'status', label: 'Cor por status' }] })}
      </div>
      ${legend(data, items)}
      ${data.contents.length === 0
        ? html`<div class="panel">${emptyState({
            icon: 'calendar',
            title: 'Nenhum conteúdo planejado ainda',
            text: 'Organize aqui os posts, carrosséis, stories e reels dos clientes e da própria MaweCreate.',
            action: button({ label: 'Novo conteúdo', action: 'content:new', variant: 'primary', icon: 'plus' }),
          })}</div>`
        : ui.mode === 'mes'
          ? renderMonth(data, items)
          : renderWeek(data, items, weekStart)}
      ${ui.mode === 'mes' && inPeriod.length
        ? html`<p class="muted small cal-foot">${CONTENT_STATUSES.map((s) => `${s.label}: ${inPeriod.filter((c) => c.status === s.value).length}`).join(' · ')}</p>`
        : ''}
    `;
  },
};
