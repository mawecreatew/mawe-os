/**
 * Faturamento em gráfico (como nas plataformas de infoproduto), com caixa,
 * lucro, a receber e receita recorrente ao lado. Fica no Financeiro.
 */
import { formatShortDate, formatWeekday, monthKey, monthLabel } from '../core/dates.ts';
import { registerActions } from '../core/events.ts';
import { formatCurrency, pluralize } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { cashPosition, monthlyRecurringRevenue, percentChange, revenueReport, upcomingBills, type RevenuePeriod, type RevenueReport } from '../domain/finance.ts';
import { rerender, store, today } from '../app/context.ts';
import { segmented } from '../ui/components.ts';
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

export function renderFinanceHero(): SafeHtml {
  const { data } = store();
  const t = today();
  const report = revenueReport(data, ui.period, t);
  const ticket = report.payments ? report.revenue / report.payments : 0;
  const receivables = upcomingBills(data, t, 30).filter((m) => m.kind === 'entrada');
  const toReceive = receivables.reduce((s, m) => s + m.amount, 0);
  const lateReceive = receivables.filter((m) => m.dueDate < t).reduce((s, m) => s + m.amount, 0);
  const mrr = monthlyRecurringRevenue(data, monthKey(t));
  const cash = cashPosition(data, t);

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
          ${segmented({ label: 'Período do gráfico', action: 'revenue:period', value: ui.period, items: PERIODS })}
        </header>
        ${renderChart(report)}
        <p class="rev-chart__legend">
          <span><i class="legend-swatch legend-swatch--revenue"></i> Faturamento (recebido)</span>
          ${report.expenses ? html`<span><i class="legend-swatch legend-swatch--expenses"></i> Despesas pagas</span>` : ''}
        </p>
      </div>

      <div class="finance-hero__kpis">
        ${kpi({
          label: 'Caixa atual',
          value: formatCurrency(cash.balance, true),
          hint: cash.reserved ? `${formatCurrency(cash.free, true)} livre · ${formatCurrency(cash.reserved, true)} em reservas` : 'Soma de todos os meses',
          tone: cash.balance < 0 ? 'danger' : undefined,
          iconName: 'wallet',
        })}
        ${kpi({
          label: 'Lucro no período',
          value: formatCurrency(report.profit, true),
          hint: `Despesas: ${formatCurrency(report.expenses, true)}${report.revenue ? ` · margem de ${Math.round((report.profit / report.revenue) * 100)}%` : ''}`,
          tone: report.profit < 0 ? 'danger' : report.profit > 0 ? 'success' : undefined,
          iconName: 'money',
        })}
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
          href: '#/clientes',
          iconName: 'repeat',
        })}
      </div>
    </section>`;
}

registerActions({
  'revenue:period': (el) => {
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

