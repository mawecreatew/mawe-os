/**
 * Relatório do site: aba "Site" na ficha do cliente e a página "Relatórios dos
 * sites" (Operações), com os números de cada mês, o gráfico, o PDF para o
 * cliente e o código de instalação (aviso de cookies + Clarity).
 */
import { monthKey, monthLabel } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import {
  SITE_SOURCES,
  change,
  clarityDashboardUrl,
  contactsOf,
  deleteSiteStat,
  saveSiteSettings,
  saveSiteStat,
  siteInstallSnippet,
  siteReportDocument,
  siteStatsMissing,
  sortedStats,
  suggestedMonth,
  trackedClients,
} from '../domain/sitereport.ts';
import { findClient } from '../domain/selectors.ts';
import type { Client, SiteStat } from '../domain/types.ts';
import { store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { button, emptyState, externalLink, notice, pageHeader, panel } from '../ui/components.ts';
import { openDocument } from '../ui/document.ts';
import { formActions, selectField, textField, textareaField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { lineChart } from '../ui/line-chart.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

function pct(n: number | null): SafeHtml | '' {
  if (n === null) return '';
  const r = Math.round(n);
  return html`<small class="${cx(r > 0 && 'text-success', r < 0 && 'text-danger')}">${r > 0 ? '+' : ''}${r}%</small>`;
}

function num(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('pt-BR');
}

function openSettings(client: Client): void {
  openModal({
    title: 'Site e Clarity',
    description: 'O ID fica no Clarity, em Configurações › Visão geral. Também dá para colar o endereço do painel.',
    body: html`<form class="form" data-form="site:settings" data-client="${client.id}">
      ${textField({ name: 'url', label: 'Endereço do site', type: 'url', value: client.site?.url ?? '', placeholder: 'https://', autofocus: true })}
      ${textField({ name: 'clarityId', label: 'ID do projeto no Clarity', value: client.site?.clarityId ?? '', placeholder: 'Ex.: k8x2abc' })}
      ${formActions('Salvar')}
    </form>`,
  });
}

function openStatForm(client: Client, stat?: SiteStat): void {
  const month = stat?.month ?? suggestedMonth(today());
  const v = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));
  openModal({
    title: stat ? `Números de ${monthLabel(stat.month)}` : 'Anotar números do mês',
    description: 'No Clarity: Painel, filtro "Último mês". Visitas = Sessões; Pessoas = Usuários distintos. Os cliques ficam em Eventos inteligentes / Eventos.',
    size: 'lg',
    body: html`<form class="form" data-form="site:stat" data-client="${client.id}">
      <div class="form-grid">
        ${textField({ name: 'month', label: 'Mês', type: 'month', value: month, required: true })}
        ${textField({ name: 'visits', label: 'Visitas (sessões)', inputmode: 'numeric', value: v(stat?.visits), required: true, autofocus: true })}
        ${textField({ name: 'people', label: 'Pessoas diferentes', inputmode: 'numeric', value: v(stat?.people) })}
        ${textField({ name: 'whatsapp', label: 'Cliques no WhatsApp', inputmode: 'numeric', value: v(stat?.whatsapp) })}
        ${textField({ name: 'instagram', label: 'Cliques no Instagram', inputmode: 'numeric', value: v(stat?.instagram) })}
        ${textField({ name: 'phone', label: 'Cliques no telefone', inputmode: 'numeric', value: v(stat?.phone) })}
        ${selectField({ name: 'topSource', label: 'De onde vieram mais visitas', value: stat?.topSource ?? '', emptyLabel: 'Não sei', options: SITE_SOURCES.map((s) => ({ value: s, label: s })) })}
      </div>
      ${textareaField({ name: 'notes', label: 'Observação para o cliente (vai no PDF)', value: stat?.notes, rows: 2, placeholder: 'Ex.: o post do Instagram do dia 12 trouxe muitas visitas' })}
      ${formActions('Salvar', stat ? button({ label: 'Apagar mês', action: 'site:stat-delete', variant: 'ghost', icon: 'trash', data: { client: client.id, month: stat.month } }) : undefined)}
    </form>`,
  });
}

/** Aba "Site" da ficha do cliente. */
export function renderSiteTab(client: Client): SafeHtml {
  const site = client.site;
  const stats = sortedStats(client);
  const last = stats.at(-1);
  const before = stats.at(-2);
  return html`
    ${panel({
      title: 'Site e Clarity',
      icon: 'globe',
      action: button({ label: 'Configurar', action: 'site:settings', icon: 'settings', variant: 'ghost', size: 'sm', data: { client: client.id } }),
      body: site?.clarityId || site?.url
        ? html`<dl class="info info--stack">
            ${site.url ? html`<div class="info__item"><dt>Site</dt><dd>${externalLink(site.url, site.url.replace(/^https?:\/\//, ''))}</dd></div>` : ''}
            <div class="info__item"><dt>Clarity</dt><dd>${site.clarityId ? html`<code>${site.clarityId}</code> · ${externalLink(clarityDashboardUrl(site.clarityId), 'Abrir o painel')}` : html`<span class="text-warning">falta o ID</span>`}</dd></div>
          </dl>
          ${site.clarityId ? html`<div class="quick-actions">${button({ label: 'Código para o site', action: 'site:snippet', icon: 'copy', size: 'sm', data: { client: client.id } })}</div>` : ''}`
        : emptyState({
            icon: 'globe',
            compact: true,
            title: 'Site ainda não acompanhado',
            text: 'Crie um projeto para este site no Microsoft Clarity (gratuito) e cole aqui o ID. Depois é só anotar os números uma vez por mês.',
            action: button({ label: 'Configurar', action: 'site:settings', variant: 'secondary', size: 'sm', icon: 'settings', data: { client: client.id } }),
          }),
    })}
    ${panel({
      title: 'Números de cada mês',
      icon: 'chart',
      action: html`${button({ label: 'Anotar mês', action: 'site:stat-new', variant: 'ghost', icon: 'plus', size: 'sm', data: { client: client.id } })}
        ${last ? button({ label: 'PDF para o cliente', action: 'site:pdf', variant: 'primary', icon: 'download', size: 'sm', data: { client: client.id, month: last.month } }) : ''}`,
      body: stats.length
        ? html`
          ${last
            ? html`<div class="stat-row stat-row--compact">
                <div class="stat"><span class="stat__label">Visitas em ${monthLabel(last.month)}</span><span class="stat__value">${num(last.visits)}</span><span class="stat__hint">${pct(change(last.visits, before?.visits))}</span></div>
                <div class="stat"><span class="stat__label">Cliques no WhatsApp</span><span class="stat__value">${num(last.whatsapp)}</span><span class="stat__hint">${pct(change(last.whatsapp, before?.whatsapp))}</span></div>
                <div class="stat"><span class="stat__label">Contatos pelo site</span><span class="stat__value">${contactsOf(last)}</span><span class="stat__hint">WhatsApp + Instagram + telefone</span></div>
              </div>`
            : ''}
          ${lineChart(stats.map((s) => ({ label: monthLabel(s.month), value: s.visits })), `Visitas ao site de ${client.company}`, 'visitas')}
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Mês</th><th class="num">Visitas</th><th class="num">Pessoas</th><th class="num">WhatsApp</th><th class="num">Instagram</th><th class="num">Telefone</th><th>Origem</th><th></th></tr></thead>
            <tbody>${[...stats].reverse().map(
              (s) => html`<tr>
                <td>${monthLabel(s.month)}</td>
                <td class="num">${num(s.visits)}</td><td class="num">${num(s.people)}</td><td class="num">${num(s.whatsapp)}</td>
                <td class="num">${num(s.instagram)}</td><td class="num">${num(s.phone)}</td><td>${s.topSource || '—'}</td>
                <td class="table__actions">
                  ${button({ label: `PDF de ${monthLabel(s.month)}`, iconOnly: true, icon: 'download', variant: 'ghost', size: 'sm', action: 'site:pdf', data: { client: client.id, month: s.month } })}
                  ${button({ label: `Editar ${monthLabel(s.month)}`, iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', action: 'site:stat-edit', data: { client: client.id, month: s.month } })}
                </td>
              </tr>`,
            )}</tbody>
          </table></div>`
        : emptyState({ icon: 'chart', compact: true, title: 'Nenhum mês anotado', text: 'No começo de cada mês, copie do Clarity as visitas e os cliques do mês anterior. O relatório em PDF sai daqui.' }),
    })}
  `;
}

function renderSites(): SafeHtml {
  const { data } = store();
  const t = today();
  const clients = trackedClients(data);
  const missing = new Set(siteStatsMissing(data, t).map((c) => c.id));
  const month = suggestedMonth(t);
  const withoutSite = data.clients.filter((c) => !clients.includes(c) && data.projects.some((p) => p.clientId === c.id && p.status === 'publicado'));
  return html`
    ${pageHeader({ title: 'Relatórios dos sites', subtitle: 'Visitas e cliques dos sites dos clientes, anotados do Microsoft Clarity uma vez por mês.' })}
    ${notice({
      title: 'Como funciona',
      icon: 'info',
      text: 'Cada site tem um projeto no Clarity e o código da Mawe (aviso de cookies + Clarity). No começo do mês, anote os números do mês anterior em cada cliente e baixe o PDF para mandar.',
    })}
    ${clients.length
      ? panel({
          title: 'Sites acompanhados',
          icon: 'globe',
          count: clients.length,
          body: html`<ul class="site-list">${clients.map((c) => {
            const stats = sortedStats(c);
            const last = stats.at(-1);
            const before = stats.at(-2);
            return html`<li class="site-row">
              <a class="site-row__main" href="#/clientes/${c.id}/site">
                <strong>${c.company}</strong>
                <small>${c.site?.url.replace(/^https?:\/\//, '') || 'sem endereço'}${c.site?.clarityId ? '' : ' · falta o ID do Clarity'}</small>
              </a>
              <span class="site-row__num">${last ? html`${num(last.visits)} visitas ${pct(change(last.visits, before?.visits))}<small>${monthLabel(last.month)}</small>` : html`<small>nenhum mês anotado</small>`}</span>
              ${missing.has(c.id)
                ? button({ label: `Anotar ${monthLabel(month)}`, action: 'site:stat-new', size: 'sm', variant: 'primary', icon: 'plus', data: { client: c.id } })
                : last
                  ? button({ label: 'PDF', action: 'site:pdf', size: 'sm', icon: 'download', data: { client: c.id, month: last.month } })
                  : button({ label: 'Anotar mês', action: 'site:stat-new', size: 'sm', icon: 'plus', data: { client: c.id } })}
            </li>`;
          })}</ul>`,
        })
      : html`<div class="panel">${emptyState({ icon: 'globe', title: 'Nenhum site acompanhado ainda', text: 'Abra um cliente, vá na aba Site e cole o ID do projeto do Clarity.' })}</div>`}
    ${withoutSite.length
      ? panel({
          title: 'Sites entregues sem acompanhamento',
          icon: 'flag',
          body: html`<ul class="link-rows">${withoutSite.map((c) => html`<li><span><strong>${c.company}</strong></span><a class="btn btn--secondary btn--sm" href="#/clientes/${c.id}/site">Configurar</a></li>`)}</ul>`,
        })
      : ''}
  `;
}

export const sitesView: View = { title: () => 'Relatórios dos sites', render: renderSites };

function intOrNull(text: string): number | null {
  if (!text) return null;
  const n = Number(text.replace(/[.\s]/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error('Use apenas números.');
  return Math.round(n);
}

registerForms({
  'site:settings': async (form, values) => {
    await store().apply((draft) => saveSiteSettings(draft, form.dataset.client!, { url: values.text('url'), clarityId: values.text('clarityId') }));
    closeModal();
    toast('Site salvo.');
  },
  'site:stat': async (form, values) => {
    const visits = intOrNull(values.text('visits'));
    if (visits === null) throw new Error('Informe as visitas do mês.');
    await store().apply((draft) =>
      saveSiteStat(draft, form.dataset.client!, {
        month: values.text('month'),
        visits,
        people: intOrNull(values.text('people')),
        whatsapp: intOrNull(values.text('whatsapp')),
        instagram: intOrNull(values.text('instagram')),
        phone: intOrNull(values.text('phone')),
        topSource: values.text('topSource'),
        notes: values.text('notes'),
      }),
    );
    closeModal();
    toast('Números do mês salvos.');
  },
});

registerActions({
  'site:settings': (el) => {
    const client = findClient(store().data, el.dataset.client);
    if (client) openSettings(client);
  },
  'site:stat-new': (el) => {
    const client = findClient(store().data, el.dataset.client);
    if (client) openStatForm(client);
  },
  'site:stat-edit': (el) => {
    const client = findClient(store().data, el.dataset.client);
    const stat = client?.site?.stats.find((s) => s.month === el.dataset.month);
    if (client && stat) openStatForm(client, stat);
  },
  'site:stat-delete': async (el) => {
    const ok = await confirmAction({ title: 'Apagar este mês?', text: 'Os números deste mês somem do relatório.', confirmLabel: 'Apagar' });
    if (!ok) return;
    await store().apply((draft) => deleteSiteStat(draft, el.dataset.client!, el.dataset.month!));
    toast('Mês apagado.');
  },
  'site:pdf': (el) => {
    const client = findClient(store().data, el.dataset.client);
    if (!client) return;
    const month = el.dataset.month ?? monthKey(today());
    openDocument(siteReportDocument(store().data, client, month), { title: `Relatório do site · ${client.company}` });
  },
  'site:snippet': (el) => {
    const client = findClient(store().data, el.dataset.client);
    if (!client?.site?.clarityId) return;
    const code = siteInstallSnippet(client.site.clarityId);
    openModal({
      title: 'Código para o site',
      description: 'Cole antes do </body> de todas as páginas do site. Ele mostra o aviso de cookies e só liga o Clarity depois que a pessoa aceita.',
      size: 'lg',
      body: html`<textarea class="input textarea code-box" id="site-snippet" rows="14" readonly>${code}</textarea>
        <footer class="form-actions"><span class="muted small">${icon('info', 13)} Sites no GitHub da Mawe: peça para o Claude instalar.</span>
          <div class="form-actions__main">${button({ label: 'Copiar código', action: 'site:snippet-copy', variant: 'primary', icon: 'copy' })}</div></footer>`,
    });
  },
  'site:snippet-copy': async () => {
    const box = document.getElementById('site-snippet') as HTMLTextAreaElement | null;
    if (!box) return;
    try {
      await navigator.clipboard.writeText(box.value);
      toast('Código copiado.');
    } catch {
      box.select();
      toast('Selecionei o código: aperte Ctrl + C.', 'info');
    }
  },
});
