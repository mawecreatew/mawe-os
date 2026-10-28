/** Painel inicial: visão do dia para o perfil ativo e resumo da agência. */
import { formatShortDate, formatWeekday, monthKey, monthLabel, relativeDay, shiftMonth } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney, pluralize } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { AGENTS } from '../agents/definitions.ts';
import { aiProvider } from '../agents/provider.ts';
import { TRACKED_SOURCES, goalsFor, monthIndicators, setMonthlyGoals } from '../domain/business.ts';
import { upcomingBills } from '../domain/finance.ts';
import { openStages, stageLabel } from '../domain/labels.ts';
import type { MonthlyGoals } from '../domain/types.ts';
import {
  activeProjects,
  currentStage,
  findClient,
  greeting,
  overdueTasks,
  pendingTasks,
  pipelineSummary,
  projectProgress,
  todayPriorities,
  upcomingDeadlines,
  type Deadline,
} from '../domain/selectors.ts';
import { allowed, requirePermission, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { avatarStack, button, emptyState, pageHeader, panel, progressBar, statCard } from '../ui/components.ts';
import { formActions, textField } from '../ui/forms.ts';
import { closeModal, openModal, toast } from '../ui/overlay.ts';
import { icon, type IconName } from '../ui/icons.ts';
import { taskList, taskRow } from '../ui/task-row.ts';

const DEADLINE_ICON: Record<Deadline['kind'], IconName> = {
  task: 'tasks',
  project: 'flag',
  followup: 'commercial',
  installment: 'money',
};

// ---------------------------------------------------------------- Metas e indicadores

function goalBar(label: string, current: number, goal: number | null, format: (n: number) => string, extra?: SafeHtml): SafeHtml {
  const pct = goal ? Math.min(100, (current / goal) * 100) : 0;
  const reached = goal !== null && goal > 0 && current >= goal;
  return html`<div class="${cx('goal', reached && 'is-reached')}">
    <div class="goal__head">
      <span class="goal__label">${label}</span>
      <span class="goal__value"><strong>${format(current)}</strong>${goal ? html` <small>de ${format(goal)}</small>` : html` <small class="muted">sem meta</small>`}</span>
    </div>
    ${goal ? progressBar(pct, label) : html`<div class="progress progress--empty" aria-hidden="true"></div>`}
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
    title: `Metas de ${monthLabel(month).replace('/', ' de ')}`,
    icon: 'target',
    className: 'goals-panel',
    action: allowed('finance:edit') ? button({ label: 'Definir metas', action: 'goals:edit', icon: 'edit', variant: 'ghost', size: 'sm' }) : undefined,
    body: html`
      ${inherited ? html`<p class="muted small">${icon('info', 13)} Usando as metas do mês anterior até vocês definirem as deste mês.</p>` : ''}
      <div class="goals">
        ${finance ? goalBar('Faturamento do mês', ind.revenue, goals.revenue, (n) => formatCurrency(n), html`<span class="goal__hint">Tudo que entrou no Financeiro</span>`) : ''}
        ${goalBar('Clientes novos', ind.newClients, goals.newClients, count)}
        ${goalBar(
          'Contatos de prospecção',
          ind.contacts.total,
          goals.contacts,
          count,
          html`<span class="goal__sources">${sources.map(
            (src) => html`<span>${src}: <strong>${ind.contacts.bySource[src] ?? 0}</strong> · ${ind.replies.bySource[src] ?? 0} responderam</span>`,
          )}</span>`,
        )}
        ${goalBar('Propostas enviadas', ind.proposalsSent, goals.proposalsSent, count)}
        ${goalBar('Propostas aceitas', ind.proposalsAccepted, goals.proposalsAccepted, count, ind.proposalsSent ? html`<span class="goal__hint">${Math.round((ind.proposalsAccepted / ind.proposalsSent) * 100)}% de aceite</span>` : undefined)}
      </div>
      <p class="panel__foot">${icon('info', 13)} Contatos e respostas vêm dos botões "Contato feito" e "Respondeu" de cada oportunidade no Comercial.</p>
    `,
  });
}

function openGoalsForm(): void {
  const { data } = store();
  const month = monthKey(today());
  const { goals } = goalsFor(data, month);
  const val = (n: number | null) => (n === null ? '' : String(n).replace('.', ','));
  openModal({
    title: `Metas de ${monthLabel(month)}`,
    description: `Valem só para este mês. ${data.goals[shiftMonth(month, -1)] ? 'Os valores vêm preenchidos com as metas do mês anterior.' : ''}`,
    body: html`
      <form class="form" data-form="goals:save" data-month="${month}">
        <div class="form-grid">
          ${textField({ name: 'revenue', label: 'Faturamento (R$)', value: val(goals.revenue), inputmode: 'decimal', autofocus: true })}
          ${textField({ name: 'newClients', label: 'Clientes novos', type: 'number', value: val(goals.newClients) })}
          ${textField({ name: 'contacts', label: 'Contatos de prospecção', type: 'number', value: val(goals.contacts) })}
          ${textField({ name: 'proposalsSent', label: 'Propostas enviadas', type: 'number', value: val(goals.proposalsSent) })}
          ${textField({ name: 'proposalsAccepted', label: 'Propostas aceitas', type: 'number', value: val(goals.proposalsAccepted) })}
        </div>
        <p class="muted small">Deixe vazio o que não quiser acompanhar.</p>
        ${formActions('Salvar metas')}
      </form>
    `,
  });
}

registerActions({ 'goals:edit': () => openGoalsForm() });

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
    };
    await store().apply((draft) => setMonthlyGoals(draft, form.dataset.month!, goals));
    closeModal();
    toast('Metas do mês salvas.');
  },
});

export const dashboardView: View = {
  title: () => 'Painel',
  render: () => {
    const { data, currentUser } = store();
    const t = today();
    const finance = allowed('finance:view');

    const priorities = todayPriorities(data, t, currentUser.id);
    const overdueAll = overdueTasks(data, t);
    const myPending = pendingTasks(data, t, currentUser.id).filter((x) => !priorities.includes(x)).slice(0, 5);
    const deadlines = upcomingDeadlines(data, t, 14).slice(0, 7);
    const bills = finance ? upcomingBills(data, t, 7) : [];
    const pipeline = pipelineSummary(data, t);
    const projects = activeProjects(data);
    const funnelScale = Math.max(1, pipeline.openCount);

    const myOverdue = overdueAll.filter((x) => x.assigneeIds.includes(currentUser.id)).length;
    const myToday = data.tasks.filter((x) => x.assigneeIds.includes(currentUser.id) && x.status !== 'concluida' && x.dueDate === t).length;
    const summary = [
      myToday ? pluralize(myToday, 'tarefa para hoje', 'tarefas para hoje') : 'Nenhuma tarefa com prazo hoje',
      myOverdue ? pluralize(myOverdue, 'atrasada', 'atrasadas') : null,
    ].filter(Boolean).join(' · ');

    return html`
      ${pageHeader({
        title: greeting(currentUser.name, store().now()),
        subtitle: html`<span>${formatWeekday(t)}</span><span class="dot-sep" aria-hidden="true">·</span><span>${summary}</span>`,
        actions: html`${button({ label: 'Nova tarefa', action: 'task:new', variant: 'primary', icon: 'plus' })}`,
      })}

      <div class="stats">
        ${statCard({ label: 'Tarefas atrasadas', value: String(overdueAll.length), hint: 'Equipe', href: '#/tarefas', tone: overdueAll.length ? 'danger' : undefined })}
        ${statCard({ label: 'Retornos comerciais', value: String(pipeline.followUpsDue), hint: 'Para hoje ou vencidos', href: '#/comercial', tone: pipeline.followUpsDue ? 'warning' : undefined })}
        ${statCard({
          label: 'Oportunidades abertas',
          value: String(pipeline.openCount),
          hint: finance ? (pipeline.openValue ? `${formatCurrency(pipeline.openValue)} estimados` : 'Sem valores estimados') : undefined,
          href: '#/comercial',
        })}
        ${statCard({ label: 'Projetos em andamento', value: String(projects.length), hint: projects[0] ? `Próxima entrega ${formatShortDate(projects[0].dueDate)}` : 'Nenhuma entrega prevista', href: '#/projetos' })}
      </div>

      ${renderGoals()}

      <div class="dashboard-grid">
        <div class="dashboard-grid__main">
          ${panel({
            title: 'Prioridades do dia',
            icon: 'flag',
            count: priorities.length,
            body: priorities.length
              ? taskList(priorities.map((task) => taskRow(data, task, t, { showAssignee: false })))
              : emptyState({ icon: 'check', compact: true, title: 'Nenhuma prioridade urgente para você hoje', text: 'Tarefas atrasadas, com prazo hoje ou de prioridade alta para os próximos 2 dias aparecem aqui.' }),
          })}

          ${panel({
            title: 'Atrasadas da equipe',
            icon: 'alert',
            count: overdueAll.length,
            action: html`<a class="panel__link" href="#/tarefas">Ver tarefas ${icon('arrowRight', 14)}</a>`,
            body: overdueAll.length
              ? taskList(overdueAll.slice(0, 6).map((task) => taskRow(data, task, t)))
              : emptyState({ icon: 'check', compact: true, title: 'Nenhuma tarefa atrasada', text: 'A equipe está com os prazos em dia.' }),
          })}

          ${panel({
            title: 'Suas próximas tarefas',
            icon: 'tasks',
            count: myPending.length,
            action: button({ label: 'Adicionar', action: 'task:new', variant: 'ghost', icon: 'plus', size: 'sm' }),
            body: myPending.length
              ? taskList(myPending.map((task) => taskRow(data, task, t, { showAssignee: false })))
              : emptyState({ icon: 'tasks', compact: true, title: 'Nenhuma outra tarefa pendente', text: 'Crie tarefas para organizar a semana.' }),
          })}
        </div>

        <aside class="dashboard-grid__side">
          ${panel({
            title: 'Próximos prazos',
            icon: 'calendar',
            body: deadlines.length
              ? html`<ol class="timeline">
                  ${deadlines.map(
                    (d) => html`<li class="timeline__item">
                      <span class="timeline__date">
                        <strong>${formatShortDate(d.date)}</strong>
                        <small>${relativeDay(d.date, t)}</small>
                      </span>
                      <a class="timeline__body" href="${d.href}">
                        <span class="timeline__title">${icon(DEADLINE_ICON[d.kind], 14)} ${d.title}</span>
                        <span class="timeline__sub">${d.subtitle}</span>
                      </a>
                    </li>`,
                  )}
                </ol>`
              : emptyState({ icon: 'calendar', compact: true, title: 'Nada previsto para os próximos 14 dias' }),
          })}

          ${finance
            ? panel({
                title: 'Contas a pagar e a receber',
                icon: 'wallet',
                count: bills.length,
                action: html`<a class="panel__link" href="#/financeiro">Financeiro ${icon('arrowRight', 14)}</a>`,
                body: bills.length
                  ? html`<ul class="bills">${bills.map(
                      (m) => html`<li class="${cx('bill', m.dueDate < t && 'is-overdue')}">
                        <input type="checkbox" class="check" data-change="finance:toggle" data-key="${m.key}" ${allowed('finance:edit') ? '' : 'disabled'}
                          aria-label="Marcar como ${m.kind === 'entrada' ? 'recebida' : 'paga'}: ${m.description}" />
                        <span class="bill__main">
                          <span class="bill__title">${m.description}</span>
                          <span class="bill__meta">${m.kind === 'entrada' ? 'A receber' : 'A pagar'} · ${m.dueDate < t ? html`<span class="text-danger">venceu ${relativeDay(m.dueDate, t)}</span>` : `${formatShortDate(m.dueDate)} · ${relativeDay(m.dueDate, t)}`}</span>
                        </span>
                        <span class="${cx('bill__amount', m.kind === 'entrada' ? 'text-success' : '')}">${m.kind === 'entrada' ? '+' : '−'} ${formatCurrency(m.amount, true)}</span>
                      </li>`,
                    )}</ul>`
                  : emptyState({ icon: 'check', compact: true, title: 'Nenhuma conta vencendo nos próximos 7 dias' }),
              })
            : ''}
        </aside>
      </div>

      <div class="dashboard-grid dashboard-grid--even">
        ${panel({
          title: 'Comercial',
          icon: 'commercial',
          action: html`<a class="panel__link" href="#/comercial">Abrir funil ${icon('arrowRight', 14)}</a>`,
          body: data.opportunities.length
            ? html`
              <div class="mini-funnel">
                ${openStages(data).map((stage) => {
                  const count = pipeline.byStage[stage] ?? 0;
                  return html`<div class="mini-funnel__row">
                    <span class="mini-funnel__label">${stageLabel(data, stage)}</span>
                    <span class="mini-funnel__track"><span class="mini-funnel__bar" style="width:${(count / funnelScale) * 100}%"></span></span>
                    <span class="mini-funnel__value">${count}</span>
                  </div>`;
                })}
              </div>
              <p class="panel__foot">
                ${pluralize(pipeline.wonCount, 'ganha', 'ganhas')} · ${pluralize(pipeline.lostCount, 'perdida', 'perdidas')}
                ${finance && pipeline.withoutValue ? html` · ${pluralize(pipeline.withoutValue, 'oportunidade sem valor estimado', 'oportunidades sem valor estimado')}` : ''}
              </p>`
            : emptyState({ icon: 'commercial', compact: true, title: 'Nenhuma oportunidade cadastrada', action: html`<a class="btn btn--secondary btn--sm" href="#/comercial">Ir para o Comercial</a>` }),
        })}

        ${panel({
          title: 'Projetos em andamento',
          icon: 'projects',
          action: html`<a class="panel__link" href="#/projetos">Ver projetos ${icon('arrowRight', 14)}</a>`,
          body: projects.length
            ? html`<ul class="project-mini-list">
                ${projects.map((p) => {
                  const progress = projectProgress(p);
                  return html`<li>
                    <a class="project-mini" href="#/projetos/${p.id}">
                      <span class="project-mini__head">
                        <span class="project-mini__name">${p.name}</span>
                        ${avatarStack(data, p.ownerIds)}
                      </span>
                      <span class="project-mini__sub">${findClient(data, p.clientId)?.company ?? '—'} · ${currentStage(p)}</span>
                      <span class="project-mini__progress">${progressBar(progress, `Progresso de ${p.name}`)}<span>${progress}%</span></span>
                      <span class="project-mini__due">Entrega ${formatShortDate(p.dueDate)} · ${relativeDay(p.dueDate, t)}</span>
                    </a>
                  </li>`;
                })}
              </ul>`
            : emptyState({ icon: 'projects', compact: true, title: 'Nenhum projeto em andamento' }),
        })}
      </div>

      ${panel({
        title: 'Agentes',
        icon: 'agents',
        action: html`<span class="${cx('status-pill', !aiProvider.connected && 'status-pill--off')}">${aiProvider.connected ? 'Modelo conectado' : 'Nenhum modelo de IA conectado'}</span>`,
        body: html`<div class="agent-quick">
          ${AGENTS.map(
            (a) => html`<a class="agent-quick__item" href="#/agentes/${a.id}">
              <span class="agent-mark agent-mark--${a.id}" aria-hidden="true">${icon('agents', 16)}</span>
              <span><strong>${a.name}</strong><small>${a.role}</small></span>
            </a>`,
          )}
        </div>`,
      })}
    `;
  },
};
