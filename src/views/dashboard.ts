/** Painel inicial: visão do dia para o perfil ativo e resumo da agência. */
import { formatShortDate, formatWeekday, relativeDay } from '../core/dates.ts';
import { formatCurrency, pluralize } from '../core/format.ts';
import { cx, html } from '../core/html.ts';
import { AGENTS } from '../agents/definitions.ts';
import { aiProvider } from '../agents/provider.ts';
import { OPEN_STAGES, OPPORTUNITY_STAGES, labelOf } from '../domain/labels.ts';
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
import { allowed, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { avatarStack, button, emptyState, pageHeader, panel, progressBar, statCard } from '../ui/components.ts';
import { icon, type IconName } from '../ui/icons.ts';
import { taskList, taskRow } from '../ui/task-row.ts';

const DEADLINE_ICON: Record<Deadline['kind'], IconName> = {
  task: 'tasks',
  project: 'flag',
  followup: 'commercial',
  installment: 'money',
};

export const dashboardView: View = {
  title: () => 'Painel',
  render: () => {
    const { data, currentUser } = store();
    const t = today();
    const finance = allowed('finance:view');

    const priorities = todayPriorities(data, t, currentUser.id);
    const overdueAll = overdueTasks(data, t);
    const myPending = pendingTasks(data, t, currentUser.id).filter((x) => !priorities.includes(x)).slice(0, 5);
    const deadlines = upcomingDeadlines(data, t, 14, { includeFinance: finance }).slice(0, 7);
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
                ${OPEN_STAGES.map((stage) => {
                  const count = pipeline.byStage[stage] ?? 0;
                  return html`<div class="mini-funnel__row">
                    <span class="mini-funnel__label">${labelOf(OPPORTUNITY_STAGES, stage)}</span>
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
