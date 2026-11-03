/**
 * Painel: a primeira tela do sistema, com cara de gestão.
 *
 * 1. Faturamento do período em gráfico (como nas plataformas de infoproduto),
 *    com lucro, despesas, a receber e receita recorrente ao lado.
 * 2. Foco de hoje: tudo que pede ação, numa lista só, em ordem de urgência.
 * 3. Funil de vendas: onde os clientes estão se perdendo e o que fazer.
 * 4. Metas do mês e projetos em andamento.
 */
import { formatShortDate, formatWeekday, monthKey, monthLabel, relativeDay, shiftMonth } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney, pluralize } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { TRACKED_SOURCES, goalsFor, monthIndicators, setMonthlyGoals } from '../domain/business.ts';
import { monthlyRecurringRevenue, percentChange, revenueReport, upcomingBills, type RevenuePeriod, type RevenueReport } from '../domain/finance.ts';
import { salesFunnel, todayFocus, type FocusItem, type FocusKind } from '../domain/insights.ts';
import type { MonthlyGoals } from '../domain/types.ts';
import { activeProjects, currentStage, findClient, greeting, projectProgress } from '../domain/selectors.ts';
import { allowed, requirePermission, rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { avatarStack, button, emptyState, pageHeader, panel, progressBar, segmented } from '../ui/components.ts';
import { formActions, textField } from '../ui/forms.ts';
import { closeModal, openModal, toast } from '../ui/overlay.ts';
import { icon, type IconName } from '../ui/icons.ts';

const ui = { period: '30d' as RevenuePeriod };

const PERIODS: Array<{ value: RevenuePeriod; label: string }> = [
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'mes', label: 'Este mês' },
  { value: '12m', label: '12 meses' },
];

const PERIOD_COMPARE: Record<RevenuePeriod, string> = {
  '7d': 'vs. 7 dias anteriores',
  '30d': 'vs. 30 dias anteriores',
  mes: 'vs. mesmo período do mês passado',
  '12m': 'vs. 12 meses anteriores',
};

const SHORT_MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

// ---------------------------------------------------------------- Gráfico de faturamento

const CHART_W = 1000;
const CHART_H = 260;

function pointLabel(key: string, granularity: RevenueReport['granularity']): string {
  if (granularity === 'mes') {
    const [y, m] = key.split('-').map(Number);
    return `${SHORT_MONTHS[m - 1]}/${String(y).slice(2)}`;
  }
  return `${key.slice(8, 10)}/${key.slice(5, 7)}`;
}

/** Topo "redondo" do eixo Y (ex.: 870 → 1.000; 2.300 → 2.500). */
function niceMax(value: number): number {
  if (value <= 0) return 25;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    if (step * magnitude >= value) return step * magnitude;
  }
  return 10 * magnitude;
}

function compactMoney(value: number): string {
  if (value >= 1000) return `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `R$ ${Math.round(value)}`;
}

/** Caminho suave (curva monotônica) que nunca "passa" dos pontos — não inventa picos. */
function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  const n = points.length;
  const dx: number[] = [];
  const slope: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(points[i + 1][0] - points[i][0]);
    slope.push((points[i + 1][1] - points[i][1]) / dx[i]);
  }
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const c = dx[i] / 3;
    d += ` C${(x0 + c).toFixed(1)},${(y0 + tangent[i] * c).toFixed(1)} ${(x1 - c).toFixed(1)},${(y1 - tangent[i + 1] * c).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

function renderChart(report: RevenueReport): SafeHtml {
  const { points, granularity } = report;
  // Topo divisível em 4 faixas "redondas" (ex.: 0, 50, 100, 150, 200).
  const top = niceMax(Math.max(...points.map((p) => Math.max(p.revenue, p.expenses))) / 4) * 4;
  const x = (i: number) => (points.length === 1 ? CHART_W / 2 : (i / (points.length - 1)) * CHART_W);
  const y = (v: number) => CHART_H - (v / top) * CHART_H;
  const revenueXY = points.map((p, i) => [x(i), y(p.revenue)] as [number, number]);
  const expenseXY = points.map((p, i) => [x(i), y(p.expenses)] as [number, number]);
  const line = smoothPath(revenueXY);
  const area = `${line} L${CHART_W},${CHART_H} L0,${CHART_H} Z`;
  const hasExpenses = points.some((p) => p.expenses > 0);
  const empty = points.every((p) => p.revenue === 0 && p.expenses === 0);

  // Até ~7 rótulos no eixo X, espalhados por igual.
  const labelEvery = Math.max(1, Math.ceil(points.length / 7));
  const xLabels = points
    .map((p, i) => ({ i, text: pointLabel(p.key, granularity) }))
    .filter(({ i }) => i % labelEvery === 0 || i === points.length - 1)
    .filter(({ i }, idx, arr) => idx === arr.length - 1 || points.length - 1 - i >= labelEvery * 0.6 || i === points.length - 1);
  const gridValues = [0, 0.25, 0.5, 0.75, 1].map((f) => f * top);

  const series = JSON.stringify(
    points.map((p) => ({
      l: granularity === 'mes' ? monthLabel(p.key) : `${formatShortDate(p.key)} · ${formatWeekday(p.key).split(',')[0]}`,
      r: formatCurrency(p.revenue, true),
      e: formatCurrency(p.expenses, true),
      y: (p.revenue / top) * 100,
    })),
  );

  return html`
    <div class="rev-chart" data-chart="${series}" data-expenses="${hasExpenses ? '1' : ''}">
      <div class="rev-chart__y" aria-hidden="true">
        ${gridValues.map((v) => html`<span style="bottom:${(v / top) * 100}%">${compactMoney(v)}</span>`)}
      </div>
      <div class="rev-chart__plot" data-chart-plot>
        <svg class="rev-chart__svg" viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="none" role="img"
          aria-label="Faturamento por ${granularity === 'mes' ? 'mês' : 'dia'}: total de ${formatCurrency(report.revenue, true)}">
          <defs>
            <linearGradient id="rev-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" style="stop-color: var(--chart-fill); stop-opacity: 0.38" />
              <stop offset="100%" style="stop-color: var(--chart-fill); stop-opacity: 0" />
            </linearGradient>
          </defs>
          ${gridValues.map((v) => html`<line class="rev-chart__grid" x1="0" x2="${CHART_W}" y1="${y(v)}" y2="${y(v)}" vector-effect="non-scaling-stroke" />`)}
          ${empty ? '' : html`<path class="rev-chart__area" d="${area}" fill="url(#rev-fill)" />`}
          ${hasExpenses ? html`<path class="rev-chart__expenses" d="${smoothPath(expenseXY)}" vector-effect="non-scaling-stroke" />` : ''}
          <path class="rev-chart__line" d="${line}" vector-effect="non-scaling-stroke" />
        </svg>
        <span class="rev-chart__guide" hidden></span>
        <span class="rev-chart__dot" hidden></span>
        <div class="rev-chart__tip" role="status" hidden></div>
        ${empty
          ? html`<div class="rev-chart__empty">
              <p>Nenhum valor recebido neste período.</p>
              <span>Marque as parcelas como pagas em Clientes ou lance uma entrada no Financeiro.</span>
            </div>`
          : ''}
      </div>
      <div class="rev-chart__x" aria-hidden="true">
        ${xLabels.map(({ i, text }) => html`<span style="left:${(x(i) / CHART_W) * 100}%">${text}</span>`)}
      </div>
    </div>`;
}

function deltaBadge(current: number, previous: number, compare: string): SafeHtml {
  const change = percentChange(current, previous);
  if (change === null) return html`<span class="delta delta--up">${icon('arrowUp', 13)} Novo <small>${compare}</small></span>`;
  if (Math.abs(change) < 0.5) return html`<span class="delta">Igual <small>${compare}</small></span>`;
  const up = change > 0;
  return html`<span class="${cx('delta', up ? 'delta--up' : 'delta--down')}">${icon(up ? 'arrowUp' : 'arrowDown', 13)} ${Math.abs(change).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% <small>${compare}</small></span>`;
}

function kpi(options: { label: string; value: string; hint?: SafeHtml | string; tone?: 'success' | 'danger' | 'warning'; href?: string; iconName: IconName }): SafeHtml {
  return html`<a class="${cx('kpi', options.tone && `kpi--${options.tone}`)}" href="${options.href ?? '#/financeiro'}">
    <span class="kpi__icon">${icon(options.iconName, 16)}</span>
    <span class="kpi__body">
      <span class="kpi__label">${options.label}</span>
      <span class="kpi__value">${options.value}</span>
      ${options.hint ? html`<span class="kpi__hint">${options.hint}</span>` : ''}
    </span>
  </a>`;
}

function renderFinanceHero(): SafeHtml {
  const { data } = store();
  const t = today();
  const report = revenueReport(data, ui.period, t);
  const ticket = report.payments ? report.revenue / report.payments : 0;
  const receivables = upcomingBills(data, t, 30).filter((m) => m.kind === 'entrada');
  const toReceive = receivables.reduce((s, m) => s + m.amount, 0);
  const lateReceive = receivables.filter((m) => m.dueDate < t).reduce((s, m) => s + m.amount, 0);
  const mrr = monthlyRecurringRevenue(data, monthKey(t));

  return html`
    <section class="finance-hero">
      <div class="finance-hero__chart panel">
        <header class="finance-hero__head">
          <div>
            <p class="finance-hero__label">Faturamento</p>
            <p class="finance-hero__value">${formatCurrency(report.revenue, true)}</p>
            <p class="finance-hero__meta">
              ${deltaBadge(report.revenue, report.previousRevenue, PERIOD_COMPARE[ui.period])}
              <span class="dot-sep" aria-hidden="true">·</span>
              <span>${pluralize(report.payments, 'recebimento', 'recebimentos')}${report.payments ? html` · ticket médio <strong>${formatCurrency(ticket, true)}</strong>` : ''}</span>
            </p>
          </div>
          ${segmented({ label: 'Período do gráfico', action: 'dashboard:period', value: ui.period, items: PERIODS })}
        </header>
        ${renderChart(report)}
        <p class="rev-chart__legend">
          <span><i class="legend-swatch legend-swatch--revenue"></i> Faturamento (recebido)</span>
          ${report.expenses ? html`<span><i class="legend-swatch legend-swatch--expenses"></i> Despesas pagas</span>` : ''}
        </p>
      </div>

      <div class="finance-hero__kpis">
        ${kpi({
          label: 'Lucro no período',
          value: formatCurrency(report.profit, true),
          hint: report.revenue ? `Margem de ${Math.round((report.profit / report.revenue) * 100)}%` : 'Faturamento − despesas',
          tone: report.profit < 0 ? 'danger' : report.profit > 0 ? 'success' : undefined,
          iconName: 'money',
        })}
        ${kpi({ label: 'Despesas no período', value: formatCurrency(report.expenses, true), hint: 'Sem contar retiradas dos sócios', iconName: 'wallet' })}
        ${kpi({
          label: 'A receber (próx. 30 dias)',
          value: formatCurrency(toReceive, true),
          hint: lateReceive ? html`<span class="text-danger">${formatCurrency(lateReceive, true)} em atraso</span>` : pluralize(receivables.length, 'parcela', 'parcelas'),
          tone: lateReceive ? 'warning' : undefined,
          iconName: 'calendar',
        })}
        ${kpi({
          label: 'Receita recorrente',
          value: `${formatCurrency(mrr.total, true)}/mês`,
          hint: mrr.plans ? pluralize(mrr.plans, 'plano mensal ativo', 'planos mensais ativos') : 'Nenhum plano mensal ativo',
          href: '#/projetos',
          iconName: 'repeat',
        })}
      </div>
    </section>`;
}

// ---------------------------------------------------------------- Foco de hoje

const FOCUS_META: Record<FocusKind, { icon: IconName; label: string }> = {
  followup: { icon: 'commercial', label: 'Comercial' },
  task: { icon: 'tasks', label: 'Tarefa' },
  bill: { icon: 'wallet', label: 'Financeiro' },
  delivery: { icon: 'flag', label: 'Entrega' },
};

function focusWhen(item: FocusItem, t: string): SafeHtml {
  if (item.overdue) return html`<span class="focus__when is-late">Atrasado · ${formatShortDate(item.date)}</span>`;
  if (item.date === t) return html`<span class="focus__when is-today">Hoje</span>`;
  return html`<span class="focus__when">${relativeDay(item.date, t)}</span>`;
}

function focusRow(item: FocusItem, t: string): SafeHtml {
  const { data } = store();
  const meta = FOCUS_META[item.kind];
  const check =
    item.taskId
      ? html`<input type="checkbox" class="check" data-change="task:toggle" data-id="${item.taskId}" aria-label="Concluir: ${item.title}" />`
      : item.movementKey
        ? html`<input type="checkbox" class="check" data-change="finance:toggle" data-key="${item.movementKey}" ${allowed('finance:edit') ? '' : 'disabled'}
            aria-label="Marcar como ${item.billKind === 'entrada' ? 'recebida' : 'paga'}: ${item.title}" />`
        : html`<span class="focus__kind-icon">${icon(meta.icon, 15)}</span>`;
  return html`<li class="${cx('focus__item', `focus__item--${item.kind}`, item.overdue && 'is-late')}">
    <span class="focus__check">${check}</span>
    <a class="focus__main" href="${item.href}">
      <span class="focus__title">${item.title}</span>
      <span class="focus__sub"><span class="focus__tag">${meta.label}</span> ${item.subtitle}</span>
    </a>
    <span class="focus__aside">
      ${item.amount !== undefined
        ? html`<span class="${cx('focus__amount', item.billKind === 'entrada' && 'text-success')}">${item.billKind === 'entrada' ? '+' : '−'} ${formatCurrency(item.amount, true)}</span>`
        : avatarStack(data, item.ownerIds)}
    </span>
    ${focusWhen(item, t)}
  </li>`;
}

function renderFocus(): SafeHtml {
  const { data } = store();
  const t = today();
  const items = todayFocus(data, t, { finance: allowed('finance:view') });
  const late = items.filter((i) => i.overdue).length;
  const shown = items.slice(0, 9);
  return panel({
    title: 'Foco de hoje',
    icon: 'target',
    count: items.length,
    className: 'focus-panel',
    action: late ? html`<span class="status-pill status-pill--alert">${pluralize(late, 'atrasado', 'atrasados')}</span>` : undefined,
    body: items.length
      ? html`
          <ul class="focus">${shown.map((item) => focusRow(item, t))}</ul>
          ${items.length > shown.length ? html`<p class="panel__foot">+ ${items.length - shown.length} itens · veja em <a href="#/tarefas">Tarefas</a> e <a href="#/comercial">Comercial</a></p>` : ''}`
      : emptyState({
          icon: 'check',
          compact: true,
          title: 'Tudo em dia por hoje',
          text: 'Retornos, tarefas, contas e entregas com prazo até hoje aparecem aqui. Bom momento para prospectar.',
          action: html`<a class="btn btn--secondary btn--sm" href="#/comercial">Abrir o Comercial</a>`,
        }),
  });
}

// ---------------------------------------------------------------- Funil de vendas

function renderFunnel(): SafeHtml {
  const { data } = store();
  const funnel = salesFunnel(data);
  const max = Math.max(1, funnel.steps[0].count);
  return panel({
    title: 'Funil de vendas',
    icon: 'commercial',
    className: 'funnel-panel',
    action: html`<a class="panel__link" href="#/comercial">Abrir ${icon('arrowRight', 14)}</a>`,
    body: data.opportunities.length
      ? html`
          <ol class="funnel">
            ${funnel.steps.map(
              (step, i) => html`<li class="${cx('funnel__step', funnel.bottleneck?.to.id === step.id && 'is-leak')}">
                <span class="funnel__label">${step.label}</span>
                <span class="funnel__track"><span class="funnel__bar funnel__bar--${i}" style="width:${Math.max(step.count ? 4 : 0, (step.count / max) * 100)}%"></span></span>
                <span class="funnel__count">${String(step.count)}</span>
                <span class="funnel__rate">${step.rate === null ? '' : `${Math.round(step.rate)}%`}</span>
              </li>`,
            )}
          </ol>
          ${funnel.bottleneck
            ? html`<div class="insight">
                <span class="insight__icon">${icon('alert', 16)}</span>
                <div>
                  <p class="insight__title">Maior perda: de "${funnel.bottleneck.from.label}" para "${funnel.bottleneck.to.label}" (${pluralize(funnel.bottleneck.lost, 'pessoa', 'pessoas')})</p>
                  <p class="insight__text">${funnel.bottleneck.advice}</p>
                </div>
              </div>`
            : html`<p class="panel__foot">${icon('info', 13)} Use "Contato feito" e "Respondeu" em cada oportunidade para o funil mostrar onde vocês perdem clientes.</p>`}`
      : emptyState({ icon: 'commercial', compact: true, title: 'Nenhuma oportunidade ainda', action: button({ label: 'Nova oportunidade', action: 'opportunity:new', variant: 'secondary', size: 'sm', icon: 'plus' }) }),
  });
}

// ---------------------------------------------------------------- Projetos

function renderProjects(): SafeHtml {
  const { data } = store();
  const t = today();
  const projects = activeProjects(data).slice(0, 6);
  return panel({
    title: 'Projetos em andamento',
    icon: 'projects',
    count: activeProjects(data).length,
    action: html`<a class="panel__link" href="#/projetos">Ver todos ${icon('arrowRight', 14)}</a>`,
    body: projects.length
      ? html`<ul class="project-cards">
          ${projects.map((p) => {
            const progress = projectProgress(p);
            const days = Math.round((Date.parse(p.dueDate) - Date.parse(t)) / 86_400_000);
            return html`<li>
              <a class="project-card" href="#/projetos/${p.id}">
                <span class="project-card__head">
                  <span class="project-card__name">${p.name}</span>
                  ${avatarStack(data, p.ownerIds)}
                </span>
                <span class="project-card__sub">${findClient(data, p.clientId)?.company ?? '—'} · ${currentStage(p)}</span>
                <span class="project-card__progress">${progressBar(progress, `Progresso de ${p.name}`)}<span>${progress}%</span></span>
                <span class="${cx('project-card__due', days < 0 && 'text-danger', days >= 0 && days <= 3 && 'text-warning')}">${icon('calendar', 13)} ${formatShortDate(p.dueDate)} · ${relativeDay(p.dueDate, t)}</span>
              </a>
            </li>`;
          })}
        </ul>`
      : emptyState({ icon: 'projects', compact: true, title: 'Nenhum projeto em andamento' }),
  });
}

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
    const { currentUser } = store();
    const t = today();
    const finance = allowed('finance:view');
    return html`
      ${pageHeader({
        title: greeting(currentUser.name, store().now()),
        subtitle: html`<span>${formatWeekday(t)}</span>`,
        actions: html`
          ${button({ label: 'Oportunidade', action: 'opportunity:new', icon: 'plus' })}
          ${allowed('finance:edit') ? button({ label: 'Entrada', action: 'finance:new-in', icon: 'plus' }) : ''}
          ${button({ label: 'Tarefa', action: 'task:new', variant: 'primary', icon: 'plus' })}
        `,
      })}

      ${finance ? renderFinanceHero() : ''}

      <div class="dashboard-grid">
        <div class="dashboard-grid__main">${renderFocus()}</div>
        <aside class="dashboard-grid__side">${renderFunnel()}</aside>
      </div>

      ${renderGoals()}
      ${renderProjects()}
    `;
  },
};

registerActions({
  'dashboard:period': (el) => {
    ui.period = el.dataset.value as RevenuePeriod;
    rerender();
  },
});

// ---------------------------------------------------------------- Interação do gráfico

interface ChartPoint {
  l: string;
  r: string;
  e: string;
  y: number;
}

if (typeof document !== 'undefined') {
  const hide = (chart: HTMLElement) => {
    chart.querySelectorAll<HTMLElement>('.rev-chart__guide, .rev-chart__dot, .rev-chart__tip').forEach((el) => (el.hidden = true));
  };
  document.addEventListener('pointermove', (event) => {
    const plot = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-chart-plot]');
    document.querySelectorAll<HTMLElement>('.rev-chart').forEach((chart) => {
      if (!plot || !chart.contains(plot)) hide(chart);
    });
    if (!plot) return;
    const chart = plot.closest<HTMLElement>('.rev-chart')!;
    let points: ChartPoint[];
    try {
      points = JSON.parse(chart.dataset.chart ?? '[]') as ChartPoint[];
    } catch {
      return;
    }
    if (!points.length) return;
    const rect = plot.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const index = points.length === 1 ? 0 : Math.round(ratio * (points.length - 1));
    const p = points[index];
    const left = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
    const guide = plot.querySelector<HTMLElement>('.rev-chart__guide')!;
    const dot = plot.querySelector<HTMLElement>('.rev-chart__dot')!;
    const tip = plot.querySelector<HTMLElement>('.rev-chart__tip')!;
    guide.hidden = false;
    dot.hidden = false;
    tip.hidden = false;
    guide.style.left = `${left}%`;
    dot.style.left = `${left}%`;
    dot.style.bottom = `${p.y}%`;
    tip.style.left = `${left}%`;
    // Balão acima do ponto; se o ponto estiver muito alto, vai para baixo dele.
    const below = p.y > 55;
    tip.style.bottom = below ? '' : `calc(${p.y}% + 14px)`;
    tip.style.top = below ? `calc(${100 - p.y}% + 14px)` : '';
    tip.classList.toggle('is-right', left > 70);
    tip.classList.toggle('is-left', left < 18);
    tip.textContent = '';
    const title = document.createElement('strong');
    title.textContent = p.l;
    const revenue = document.createElement('span');
    revenue.textContent = `Faturamento: ${p.r}`;
    tip.append(title, revenue);
    if (chart.dataset.expenses) {
      const expenses = document.createElement('span');
      expenses.className = 'rev-chart__tip-muted';
      expenses.textContent = `Despesas: ${p.e}`;
      tip.append(expenses);
    }
  });
}

