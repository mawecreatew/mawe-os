/** Relatório do mês: dinheiro, vendas, marketing e entregas numa página, com PDF. */
import { monthKey, monthLabel, monthLabelLong, shiftMonth } from '../core/dates.ts';
import { registerActions } from '../core/events.ts';
import { formatCurrency } from '../core/format.ts';
import { html, type SafeHtml } from '../core/html.ts';
import type { AgencyDocument } from '../domain/documents.ts';
import { monthReport, type MonthReport } from '../domain/marketing.ts';
import { allowed, rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { button, pageHeader, panel, statCard } from '../ui/components.ts';
import { openDocument } from '../ui/document.ts';
import { icon } from '../ui/icons.ts';

const ui = { month: '' };

function pct(n: number | null): string {
  return n === null ? '—' : `${Math.round(n)}%`;
}

function signed(n: number | null): string {
  if (n === null) return '';
  return ` (${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR')})`;
}

export function reportDocument(r: MonthReport, finance: boolean): AgencyDocument {
  const rows: Array<[string, string]> = [];
  if (finance) {
    rows.push(['Faturamento', formatCurrency(r.revenue, true)], ['Despesas pagas', formatCurrency(r.expenses, true)], ['Lucro', formatCurrency(r.profit, true)]);
  }
  return {
    fileName: `relatorio-mawecreate-${r.month}`,
    blocks: [
      { t: 'title', text: 'RELATÓRIO DO MÊS' },
      { t: 'subtitle', text: `MaweCreate · ${monthLabelLong(r.month)}` },
      ...(finance ? [{ t: 'heading' as const, text: 'Dinheiro' }, { t: 'table' as const, rows }] : []),
      { t: 'heading', text: 'Vendas' },
      {
        t: 'table',
        rows: [
          ['Leads contatados', String(r.contacted)],
          ['Responderam', `${r.replied} (${pct(r.replyRate)})`],
          ['Fecharam', String(r.won)],
          ['Não rolou', String(r.lost)],
          ['Propostas enviadas', String(r.proposalsSent)],
          ['Propostas aceitas', String(r.proposalsAccepted)],
          ['Clientes novos', String(r.newClients)],
        ],
      },
      ...(r.bySource.length
        ? [{ t: 'heading' as const, text: 'De onde vieram os contatos' }, { t: 'table' as const, rows: r.bySource.map((s): [string, string] => [s.source, `${s.contacted} contatados · ${s.replied} responderam · ${s.won} fecharam`]) }]
        : []),
      { t: 'heading', text: 'Entregas e marketing' },
      {
        t: 'table',
        rows: [
          ['Projetos entregues', String(r.projectsDelivered)],
          ['Posts no Instagram da Mawe', String(r.posts)],
          ['Seguidores', r.followers === null ? 'não anotado' : `${r.followers.toLocaleString('pt-BR')}${signed(r.followersChange)}`],
        ],
      },
      { t: 'note', text: 'Números calculados pela Central MaweCreate a partir do que foi registrado no sistema.' },
    ],
  };
}

function render(): SafeHtml {
  const { data } = store();
  const current = monthKey(today());
  const month = ui.month || current;
  const r = monthReport(data, month);
  const finance = allowed('finance:view');
  return html`
    ${pageHeader({
      title: `Relatório de ${monthLabel(month)}`,
      subtitle: 'O mês da agência numa página: dinheiro, vendas, entregas e Instagram.',
      actions: html`
        ${button({ label: 'Mês anterior', iconOnly: true, icon: 'arrowLeft', action: 'report:month', data: { value: shiftMonth(month, -1) } })}
        ${month < current ? button({ label: 'Próximo mês', iconOnly: true, icon: 'arrowRight', action: 'report:month', data: { value: shiftMonth(month, 1) } }) : ''}
        ${button({ label: 'Baixar PDF', action: 'report:pdf', variant: 'primary', icon: 'download' })}
      `,
    })}
    ${finance
      ? html`<div class="stat-row">
          ${statCard({ label: 'Faturamento', value: formatCurrency(r.revenue, true), hint: 'recebido no mês', href: '#/financeiro' })}
          ${statCard({ label: 'Despesas', value: formatCurrency(r.expenses, true), hint: 'pagas no mês' })}
          ${statCard({ label: 'Lucro', value: formatCurrency(r.profit, true), tone: r.profit < 0 ? 'danger' : r.profit > 0 ? 'success' : undefined })}
          ${statCard({ label: 'Clientes novos', value: String(r.newClients), href: '#/clientes' })}
        </div>`
      : ''}
    <div class="detail-grid">
      <div class="detail-grid__main">
        ${panel({
          title: 'Vendas',
          icon: 'commercial',
          body: html`<div class="stat-row stat-row--compact">
              ${statCard({ label: 'Contatados', value: String(r.contacted) })}
              ${statCard({ label: 'Responderam', value: String(r.replied), hint: pct(r.replyRate) })}
              ${statCard({ label: 'Fecharam', value: String(r.won) })}
              ${statCard({ label: 'Propostas', value: `${r.proposalsAccepted}/${r.proposalsSent}`, hint: 'aceitas / enviadas' })}
            </div>
            ${r.bySource.length
              ? html`<div class="table-wrap"><table class="table"><thead><tr><th>Origem</th><th class="num">Contatados</th><th class="num">Responderam</th><th class="num">Fecharam</th></tr></thead>
                  <tbody>${r.bySource.map((s) => html`<tr><td>${s.source}</td><td class="num">${s.contacted}</td><td class="num">${s.replied}</td><td class="num">${s.won}</td></tr>`)}</tbody></table></div>`
              : html`<p class="muted small">Nenhum contato registrado neste mês.</p>`}`,
        })}
      </div>
      <aside class="detail-grid__side">
        ${panel({
          title: 'Entregas e Instagram',
          icon: 'image',
          body: html`<dl class="info info--stack">
            <div class="info__item"><dt>Projetos entregues</dt><dd>${r.projectsDelivered}</dd></div>
            <div class="info__item"><dt>Posts da Mawe</dt><dd>${r.posts}</dd></div>
            <div class="info__item"><dt>Seguidores</dt><dd>${r.followers === null ? html`<a href="#/marketing">anotar</a>` : `${r.followers.toLocaleString('pt-BR')}${signed(r.followersChange)}`}</dd></div>
            <div class="info__item"><dt>Não rolou</dt><dd>${r.lost} ${r.lost ? html`<a href="#/comercial/relatorios">ver motivos</a>` : ''}</dd></div>
          </dl>`,
        })}
      </aside>
    </div>
    <p class="muted small">${icon('info', 13)} Para ver o mês em gráfico, abra o <a href="#/financeiro">Financeiro</a>.</p>
  `;
}

export const reportView: View = { title: () => 'Relatório do mês', render };

registerActions({
  'report:month': (el) => {
    ui.month = el.dataset.value!;
    rerender();
  },
  'report:pdf': () => {
    const month = ui.month || monthKey(today());
    openDocument(reportDocument(monthReport(store().data, month), allowed('finance:view')), { title: `Relatório de ${monthLabel(month)}` });
  },
});
