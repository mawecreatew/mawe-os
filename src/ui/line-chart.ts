/** Gráfico de linha simples (SVG), usado nos seguidores e nas visitas dos sites. */
import { html, type SafeHtml } from '../core/html.ts';
import { icon } from './icons.ts';

const W = 1000;
const H = 220;

export function lineChart(points: Array<{ label: string; value: number }>, ariaLabel: string, unit: string): SafeHtml {
  if (points.length < 2) {
    return html`<p class="muted small">${icon('info', 13)} O gráfico aparece a partir do segundo mês anotado.</p>`;
  }
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(1, Math.round((max - min) * 0.15));
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const every = Math.max(1, Math.ceil(points.length / 8));
  return html`<figure class="follow-chart">
    <div class="follow-chart__plot">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${ariaLabel}: de ${values[0]} para ${values.at(-1)}">
        ${[0, 0.5, 1].map((f) => html`<line class="follow-chart__grid" x1="0" x2="${W}" y1="${H * f}" y2="${H * f}" vector-effect="non-scaling-stroke" />`)}
        <polygon class="follow-chart__area" points="0,${H} ${line} ${W},${H}" />
        <polyline class="follow-chart__line" points="${line}" vector-effect="non-scaling-stroke" />
      </svg>
      ${points.map((p, i) => html`<span class="follow-chart__dot" style="left:${(x(i) / W) * 100}%; bottom:${((H - y(p.value)) / H) * 100}%" title="${p.label}: ${p.value.toLocaleString('pt-BR')} ${unit}"></span>`)}
    </div>
    <div class="follow-chart__x" aria-hidden="true">
      ${points.map((p, i) => (i % every === 0 || i === points.length - 1 ? html`<span style="left:${(x(i) / W) * 100}%">${p.label}</span>` : ''))}
    </div>
    <figcaption class="follow-chart__range"><span>${hi.toLocaleString('pt-BR')}</span><span>${lo.toLocaleString('pt-BR')}</span></figcaption>
  </figure>`;
}
