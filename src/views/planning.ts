/**
 * Planejamento da agência: meta do mês, metas da semana de cada um e o quadro
 * de ideias da própria Mawe (Ideia → Fazendo → Feito).
 */
import { addDays, formatShortDate, monthKey, monthLabel, shiftMonth, startOfWeek } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney } from '../core/format.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import { TRACKED_SOURCES, goalsFor, monthIndicators, setMonthlyGoals } from '../domain/business.ts';
import { postsInMonth } from '../domain/marketing.ts';
import { resolvePeople, teamMembers } from '../domain/people.ts';
import type { AgencyIdea, IdeaStatus, MonthlyGoals } from '../domain/types.ts';
import { IDEA_STATUSES, addWeekGoal, deleteIdea, deleteWeekGoal, moveIdea, saveIdea, toggleWeekGoal, weekGoals } from '../domain/workspace.ts';
import { allowed, requirePermission, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { avatarStack, button, emptyState, pageHeader, panel, progressBar } from '../ui/components.ts';
import { formActions, selectField, textField, textareaField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';
import { peopleField, readPeople } from '../ui/people-picker.ts';

// ---------------------------------------------------------------- Meta do mês

function goalBar(label: string, current: number, goal: number | null | undefined, format: (n: number) => string, extra?: SafeHtml): SafeHtml {
  const target = goal ?? null;
  const pct = target ? Math.min(100, (current / target) * 100) : 0;
  const reached = target !== null && target > 0 && current >= target;
  return html`<div class="${cx('goal', reached && 'is-reached')}">
    <div class="goal__head">
      <span class="goal__label">${label}</span>
      <span class="goal__value"><strong>${format(current)}</strong>${target ? html` <small>de ${format(target)}</small>` : html` <small class="muted">sem meta</small>`}</span>
    </div>
    ${target ? progressBar(pct, label) : html`<div class="progress progress--empty" aria-hidden="true"></div>`}
    ${extra ?? ''}
    ${reached ? html`<span class="goal__badge">${icon('check', 12)} Meta batida!</span>` : ''}
  </div>`;
}

function renderGoals(): SafeHtml {
  const { data } = store();
  const month = monthKey(today());
  const finance = allowed('finance:view');
  const { goals, inherited } = goalsFor(data, month);
  const ind = monthIndicators(data, month);
  const count = (n: number) => String(n);
  const sources = [...TRACKED_SOURCES, 'Outras'].filter((s) => s !== 'Outras' || ind.contacts.bySource[s]);
  return panel({
    title: `Meta de ${monthLabel(month).replace('/', ' de ')}`,
    icon: 'target',
    className: 'goals-panel',
    action: allowed('finance:edit') ? button({ label: 'Definir metas', action: 'goals:edit', icon: 'edit', variant: 'ghost', size: 'sm' }) : undefined,
    body: html`
      ${inherited ? html`<p class="muted small">${icon('info', 13)} Usando as metas do mês anterior até vocês definirem as deste mês.</p>` : ''}
      <div class="goals">
        ${finance ? goalBar('Faturamento do mês', ind.revenue, goals.revenue, (n) => formatCurrency(n), html`<span class="goal__hint">Tudo que entrou no Financeiro</span>`) : ''}
        ${goalBar('Clientes novos', ind.newClients, goals.newClients, count)}
        ${goalBar('Posts no Instagram da Mawe', postsInMonth(data, month), goals.posts, count, html`<span class="goal__hint">Ideias de post marcadas como postadas e posts da Mawe no calendário</span>`)}
        ${goalBar(
          'Contatos de prospecção',
          ind.contacts.total,
          goals.contacts,
          count,
          html`<span class="goal__sources">${sources.map((src) => html`<span>${src}: <strong>${ind.contacts.bySource[src] ?? 0}</strong> · ${ind.replies.bySource[src] ?? 0} responderam</span>`)}</span>`,
        )}
        ${goalBar('Propostas enviadas', ind.proposalsSent, goals.proposalsSent, count)}
        ${goalBar('Propostas aceitas', ind.proposalsAccepted, goals.proposalsAccepted, count)}
      </div>
    `,
  });
}

function openGoalsForm(): void {
  const { data } = store();
  const month = monthKey(today());
  const { goals } = goalsFor(data, month);
  const val = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));
  openModal({
    title: `Metas de ${monthLabel(month)}`,
    description: `Valem só para este mês. ${data.goals[shiftMonth(month, -1)] ? 'Os valores vêm preenchidos com as metas do mês anterior.' : ''}`,
    body: html`
      <form class="form" data-form="goals:save" data-month="${month}">
        <div class="form-grid">
          ${textField({ name: 'revenue', label: 'Faturamento (R$)', value: val(goals.revenue), inputmode: 'decimal', autofocus: true })}
          ${textField({ name: 'newClients', label: 'Clientes novos', type: 'number', value: val(goals.newClients) })}
          ${textField({ name: 'posts', label: 'Posts no Instagram da Mawe', type: 'number', value: val(goals.posts) })}
          ${textField({ name: 'contacts', label: 'Contatos de prospecção (no mês)', type: 'number', value: val(goals.contacts) })}
          ${textField({ name: 'dailyContacts', label: 'Contatos por dia', type: 'number', value: val(goals.dailyContacts ?? null), hint: 'Aparece na Prospecção.' })}
          ${textField({ name: 'proposalsSent', label: 'Propostas enviadas', type: 'number', value: val(goals.proposalsSent) })}
          ${textField({ name: 'proposalsAccepted', label: 'Propostas aceitas', type: 'number', value: val(goals.proposalsAccepted) })}
        </div>
        <p class="muted small">Deixe vazio o que não quiser acompanhar.</p>
        ${formActions('Salvar metas')}
      </form>
    `,
  });
}

// ---------------------------------------------------------------- Metas da semana

function renderWeek(): SafeHtml {
  const { data, currentUser } = store();
  const t = today();
  const week = startOfWeek(t);
  const goals = weekGoals(data, week);
  const people = teamMembers(data);
  const done = goals.filter((g) => g.done).length;
  return panel({
    title: `Metas da semana (${formatShortDate(week)} a ${formatShortDate(addDays(week, 6))})`,
    icon: 'flag',
    action: goals.length ? html`<span class="muted small">${done} de ${goals.length} feitas</span>` : undefined,
    body: html`
      <div class="week-cols">
        ${[...people.map((p) => ({ id: p.id as string | null, name: p.shortName.split(' ')[0] })), { id: null, name: 'Da agência' }].map((col) => {
          const list = goals.filter((g) => g.ownerId === col.id);
          return html`<div class="week-col">
            <h3 class="week-col__title">${col.name}</h3>
            <ul class="checklist">
              ${list.map(
                (g) => html`<li class="${cx('checklist__item', g.done && 'is-done')}">
                  <label><input type="checkbox" class="check" ${g.done ? 'checked' : ''} data-change="week:toggle" data-id="${g.id}" /><span>${g.text}</span></label>
                  ${button({ label: 'Tirar meta', iconOnly: true, icon: 'close', variant: 'ghost', size: 'sm', action: 'week:delete', data: { id: g.id } })}
                </li>`,
              )}
            </ul>
            <form class="inline-form" data-form="week:add" data-owner="${col.id ?? ''}">
              <label class="visually-hidden" for="week-new-${col.id ?? 'agencia'}">Nova meta da semana (${col.name})</label>
              <input id="week-new-${col.id ?? 'agencia'}" class="input" name="text" placeholder="${col.id === currentUser.id ? 'Minha meta da semana' : 'Nova meta'}" autocomplete="off" maxlength="160" />
              <button class="btn btn--secondary btn--icon" type="submit" aria-label="Adicionar meta">${icon('plus', 16)}</button>
            </form>
          </div>`;
        })}
      </div>
    `,
  });
}

// ---------------------------------------------------------------- Quadro de ideias

function openIdeaForm(idea?: AgencyIdea): void {
  const { data, currentUser } = store();
  openModal({
    title: idea ? 'Editar ideia' : 'Nova ideia da agência',
    description: 'Projetos internos da Mawe: um produto novo, melhorar o portfólio, um curso, uma parceria...',
    body: html`<form class="form" data-form="idea:save" data-id="${idea?.id ?? ''}">
      ${textField({ name: 'title', label: 'Ideia', value: idea?.title, required: true, autofocus: true })}
      ${textareaField({ name: 'notes', label: 'Detalhes', value: idea?.notes, rows: 4, placeholder: 'Por que vale a pena, primeiros passos, links...' })}
      ${peopleField({ data, name: 'owners', label: 'Quem cuida', value: idea?.ownerIds ?? [currentUser.id] })}
      ${selectField({ name: 'status', label: 'Situação', value: idea?.status ?? 'ideia', options: IDEA_STATUSES })}
      ${formActions(idea ? 'Salvar' : 'Criar ideia', idea ? button({ label: 'Apagar', action: 'idea:delete', variant: 'ghost', icon: 'trash', data: { id: idea.id } }) : undefined)}
    </form>`,
  });
}

function renderIdeas(): SafeHtml {
  const { data } = store();
  const ideas = data.ideas ?? [];
  return panel({
    title: 'Quadro de ideias da Mawe',
    icon: 'layers',
    count: ideas.filter((i) => i.status !== 'feito').length,
    action: button({ label: 'Nova ideia', action: 'idea:new', variant: 'ghost', icon: 'plus', size: 'sm' }),
    body: ideas.length
      ? html`<div class="mini-board">
          ${IDEA_STATUSES.map((s, si) => {
            const list = ideas.filter((i) => i.status === s.value);
            return html`<section class="mini-board__col">
              <h3 class="mini-board__title">${s.label} <span class="panel__count">${list.length}</span></h3>
              ${list.map(
                (i) => html`<article class="mini-card">
                  <button type="button" class="mini-card__title" data-action="idea:edit" data-id="${i.id}">${i.title}</button>
                  ${i.notes ? html`<p class="mini-card__text">${multiline(i.notes.length > 160 ? `${i.notes.slice(0, 160)}...` : i.notes)}</p>` : ''}
                  <footer class="mini-card__foot">
                    ${avatarStack(data, i.ownerIds)}
                    <span>
                      ${si > 0 ? button({ label: `Voltar para ${IDEA_STATUSES[si - 1].label}`, iconOnly: true, icon: 'arrowLeft', variant: 'ghost', size: 'sm', action: 'idea:move', data: { id: i.id, status: IDEA_STATUSES[si - 1].value } }) : ''}
                      ${si < IDEA_STATUSES.length - 1 ? button({ label: `Mover para ${IDEA_STATUSES[si + 1].label}`, iconOnly: true, icon: 'arrowRight', variant: 'ghost', size: 'sm', action: 'idea:move', data: { id: i.id, status: IDEA_STATUSES[si + 1].value } }) : ''}
                    </span>
                  </footer>
                </article>`,
              )}
            </section>`;
          })}
        </div>`
      : emptyState({ icon: 'layers', compact: true, title: 'Nenhuma ideia ainda', text: 'Guarde aqui os projetos da própria agência e acompanhe de Ideia até Feito.', action: button({ label: 'Nova ideia', action: 'idea:new', variant: 'secondary', size: 'sm', icon: 'plus' }) }),
  });
}

export const planningView: View = {
  title: () => 'Planejamento da agência',
  render: () => html`
    ${pageHeader({ title: 'Planejamento da agência', subtitle: 'Onde a Mawe quer chegar neste mês e nesta semana, e as ideias para crescer.' })}
    ${renderGoals()}
    ${renderWeek()}
    ${renderIdeas()}
  `,
};

registerForms({
  'goals:save': async (form, values) => {
    requirePermission('finance:edit');
    const read = (name: string) => {
      const text = values.text(name);
      if (!text) return null;
      const n = parseMoney(text);
      if (n === null) throw new Error('Use apenas números nas metas.');
      return n;
    };
    const goals: MonthlyGoals = {
      revenue: read('revenue'),
      newClients: read('newClients'),
      contacts: read('contacts'),
      proposalsSent: read('proposalsSent'),
      proposalsAccepted: read('proposalsAccepted'),
      dailyContacts: read('dailyContacts'),
      posts: read('posts'),
    };
    await store().apply((draft) => setMonthlyGoals(draft, form.dataset.month!, goals));
    closeModal();
    toast('Metas do mês salvas.');
  },
  'week:add': async (form, values) => {
    const owner = form.dataset.owner || null;
    await store().apply((draft) => addWeekGoal(draft, today(), values.text('text'), owner));
  },
  'idea:save': async (form, values) => {
    const id = form.dataset.id || null;
    await store().apply((draft, ctx) =>
      saveIdea(draft, id, { title: values.text('title'), notes: values.text('notes'), ownerIds: resolvePeople(draft, readPeople(values, 'owners')), status: values.text('status') as IdeaStatus }, ctx),
    );
    closeModal();
    toast(id ? 'Ideia salva.' : 'Ideia criada.');
  },
});

registerActions({
  'goals:edit': () => openGoalsForm(),
  'week:toggle': async (el) => {
    await store().apply((draft) => toggleWeekGoal(draft, el.dataset.id!));
  },
  'week:delete': async (el) => {
    await store().apply((draft) => deleteWeekGoal(draft, el.dataset.id!));
  },
  'idea:new': () => openIdeaForm(),
  'idea:edit': (el) => {
    const idea = (store().data.ideas ?? []).find((i) => i.id === el.dataset.id);
    if (!idea) return;
    openIdeaForm(idea);
  },
  'idea:move': async (el) => {
    await store().apply((draft, ctx) => moveIdea(draft, el.dataset.id!, el.dataset.status as IdeaStatus, ctx));
  },
  'idea:delete': async (el) => {
    const ok = await confirmAction({ title: 'Apagar ideia?', text: 'A ideia some do quadro.', confirmLabel: 'Apagar' });
    if (!ok) return;
    await store().apply((draft) => deleteIdea(draft, el.dataset.id!));
    closeModal();
    toast('Ideia apagada.');
  },
});
