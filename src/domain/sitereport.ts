/**
 * Relatório do site do cliente.
 *
 * Os números vêm do Microsoft Clarity (gratuito) e são anotados uma vez por
 * mês na Central. Daqui sai o PDF que vai para o cliente, com a evolução mês a
 * mês. O código que vai no site (aviso de cookies + Clarity + cliques no
 * WhatsApp, Instagram e telefone) também é gerado aqui, com o ID de cada site.
 */
import { monthLabelLong, monthLabel, shiftMonth, type ISODate, type MonthKey } from '../core/dates.ts';
import { agencyOf } from './daily.ts';
import type { AgencyDocument, DocBlock } from './documents.ts';
import type { AppData, Client, ID, SiteStat } from './types.ts';

const CLARITY_ID = /^[a-z0-9]{6,16}$/;

function findClient(draft: AppData, id: ID): Client {
  const client = draft.clients.find((c) => c.id === id);
  if (!client) throw new Error('Cliente não encontrado.');
  return client;
}

/** Aceita o ID puro ou o endereço do painel do Clarity e devolve só o ID. */
export function parseClarityId(text: string): string {
  const clean = text.trim();
  if (!clean) return '';
  const fromUrl = /clarity\.(?:microsoft\.com\/projects\/view|ms\/tag)\/([a-z0-9]+)/i.exec(clean);
  const id = (fromUrl ? fromUrl[1] : clean).toLowerCase();
  if (!CLARITY_ID.test(id)) throw new Error('O ID do Clarity tem só letras e números (ex.: k8x2abc). Copie em Configurações › Visão geral.');
  return id;
}

export function saveSiteSettings(draft: AppData, clientId: ID, input: { url: string; clarityId: string }): void {
  const client = findClient(draft, clientId);
  const url = input.url.trim();
  if (url && !/^https?:\/\/\S+\.\S+/i.test(url)) throw new Error('Cole o endereço completo do site (começando com https://).');
  const clarityId = parseClarityId(input.clarityId);
  if (!url && !clarityId) {
    client.site = client.site?.stats.length ? { ...client.site, url: '', clarityId: '' } : null;
    return;
  }
  client.site = { url, clarityId, stats: client.site?.stats ?? [] };
}

export function saveSiteStat(draft: AppData, clientId: ID, stat: SiteStat): void {
  const client = findClient(draft, clientId);
  if (!/^\d{4}-\d{2}$/.test(stat.month)) throw new Error('Escolha o mês.');
  const ints = [stat.visits, stat.people, stat.whatsapp, stat.instagram, stat.phone];
  if (ints.some((v) => v !== null && (!Number.isInteger(v) || v < 0))) throw new Error('Use números inteiros.');
  const site = client.site ?? { url: '', clarityId: '', stats: [] };
  const clean: SiteStat = { ...stat, topSource: stat.topSource.trim(), notes: stat.notes.trim() };
  site.stats = [...site.stats.filter((s) => s.month !== stat.month), clean].sort((a, b) => a.month.localeCompare(b.month));
  client.site = site;
}

export function deleteSiteStat(draft: AppData, clientId: ID, month: string): void {
  const client = findClient(draft, clientId);
  if (client.site) client.site.stats = client.site.stats.filter((s) => s.month !== month);
}

/** Endereço do painel do site no Clarity. */
export function clarityDashboardUrl(clarityId: string): string {
  return `https://clarity.microsoft.com/projects/view/${clarityId}/dashboard`;
}

export function sortedStats(client: Client): SiteStat[] {
  return [...(client.site?.stats ?? [])].sort((a, b) => a.month.localeCompare(b.month));
}

/** Variação em % (null quando não dá para comparar). */
export function change(current: number | null, previous: number | null | undefined): number | null {
  if (current === null || previous === null || previous === undefined || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export function contactsOf(s: SiteStat): number {
  return (s.whatsapp ?? 0) + (s.instagram ?? 0) + (s.phone ?? 0);
}

/** Clientes com site acompanhado. */
export function trackedClients(data: AppData): Client[] {
  return data.clients.filter((c) => c.site && (c.site.clarityId || c.site.stats.length)).sort((a, b) => a.company.localeCompare(b.company, 'pt-BR'));
}

/** Clientes com Clarity que ainda não têm os números do mês passado (lembrete no começo do mês). */
export function siteStatsMissing(data: AppData, today: ISODate): Client[] {
  const day = Number(today.slice(8, 10));
  if (day > 10) return [];
  const last = shiftMonth(today.slice(0, 7), -1);
  return trackedClients(data).filter((c) => c.site?.clarityId && !c.site.stats.some((s) => s.month === last));
}

function signed(n: number | null): string {
  if (n === null) return '';
  const r = Math.round(n);
  return r === 0 ? 'igual ao mês anterior' : `${r > 0 ? '+' : ''}${r}% em relação ao mês anterior`;
}

/** Primeiro nome, pulando "Dr.", "Dra.", "Sr." e "Sra.". */
export function firstName(name: string): string {
  return name.trim().split(/\s+/).find((w) => !/^(dra?|sra?|prof[a]?)\.?$/i.test(w)) ?? '';
}

/** PDF do relatório para o cliente. */
export function siteReportDocument(data: AppData, client: Client, month: MonthKey): AgencyDocument {
  const agency = agencyOf(data);
  const stats = sortedStats(client).filter((s) => s.month <= month);
  const current = stats.find((s) => s.month === month);
  if (!current) throw new Error(`Anote os números de ${monthLabel(month)} antes de gerar o relatório.`);
  const previous = stats.filter((s) => s.month < month).at(-1);
  const blocks: DocBlock[] = [
    { t: 'title', text: 'RELATÓRIO DO SITE' },
    { t: 'subtitle', text: `${client.company} · ${monthLabelLong(month)}` },
    { t: 'paragraph', text: `Olá, ${firstName(client.contactName) || client.company}! Este é o resumo de como o seu site foi usado em ${monthLabelLong(month).toLowerCase()}.` },
    { t: 'heading', text: 'Números do mês' },
    {
      t: 'table',
      rows: [
        ['Visitas ao site', `${current.visits.toLocaleString('pt-BR')}${previous ? ` (${signed(change(current.visits, previous.visits))})` : ''}`],
        ...(current.people !== null ? [['Pessoas diferentes', current.people.toLocaleString('pt-BR')] as [string, string]] : []),
        ...(current.whatsapp !== null ? [['Cliques no WhatsApp', `${current.whatsapp}${previous?.whatsapp !== undefined && previous?.whatsapp !== null ? ` (${signed(change(current.whatsapp, previous.whatsapp))})` : ''}`] as [string, string]] : []),
        ...(current.instagram !== null ? [['Cliques no Instagram', String(current.instagram)] as [string, string]] : []),
        ...(current.phone !== null ? [['Cliques no telefone', String(current.phone)] as [string, string]] : []),
        ...(current.topSource ? [['De onde vieram mais visitas', current.topSource] as [string, string]] : []),
      ],
    },
  ];
  const contacts = contactsOf(current);
  if (contacts > 0) {
    blocks.push({ t: 'paragraph', text: `Ou seja: ${contacts} ${contacts === 1 ? 'pessoa clicou' : 'pessoas clicaram'} para falar com você direto do site neste mês.` });
  }
  const history = stats.slice(-6);
  if (history.length > 1) {
    blocks.push({ t: 'heading', text: 'Evolução' });
    blocks.push({
      t: 'table',
      rows: history.map((s): [string, string] => [monthLabel(s.month), `${s.visits.toLocaleString('pt-BR')} visitas${s.whatsapp !== null ? ` · ${s.whatsapp} no WhatsApp` : ''}`]),
    });
  }
  if (current.notes) {
    blocks.push({ t: 'heading', text: 'Observações da Mawe' });
    blocks.push({ t: 'paragraph', text: current.notes });
  }
  blocks.push({ t: 'note', text: `Números do Microsoft Clarity, contados só de quem aceitou os cookies do site. Relatório preparado por ${agency.name}${agency.whatsapp ? ` · WhatsApp ${agency.whatsapp}` : ''}.` });
  const slug = client.company.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return { fileName: `relatorio-site-${slug}-${month}`, blocks };
}

/**
 * Código para colar no fim do <body> do site: aviso de cookies (Aceitar e
 * Recusar) e o Clarity, que só carrega depois que a pessoa aceita. Os cliques
 * em links do WhatsApp, Instagram e telefone viram eventos no Clarity.
 */
export function siteInstallSnippet(clarityId: string): string {
  const id = parseClarityId(clarityId);
  if (!id) throw new Error('Informe o ID do Clarity.');
  return `<!-- Mawe Create: aviso de cookies + Microsoft Clarity (${id}) -->
<div id="mawe-cookies" role="dialog" aria-live="polite" aria-label="Aviso de cookies" hidden
  style="position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:560px;margin:0 auto;padding:16px 18px;border-radius:14px;background:#ffffff;color:#2b2b2b;box-shadow:0 8px 30px rgba(0,0,0,.18);font:14px/1.5 system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
  <p style="margin:0 0 12px">Usamos cookies para entender como o site é usado e melhorar a sua experiência. Você aceita?</p>
  <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
    <button type="button" data-mawe-cookies="recusar" style="padding:8px 14px;border-radius:999px;border:1px solid #c9c9c9;background:transparent;color:inherit;font:inherit;cursor:pointer">Recusar</button>
    <button type="button" data-mawe-cookies="aceitar" style="padding:8px 16px;border-radius:999px;border:0;background:#2b2b2b;color:#ffffff;font:inherit;font-weight:600;cursor:pointer">Aceitar</button>
  </div>
</div>
<script>
(function () {
  var KEY = 'mawe-cookies';
  var banner = document.getElementById('mawe-cookies');
  function read() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  function start() {
    (function (c, l, a, r, i, t, y) {
      c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
      t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
      y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', '${id}');
    window.clarity('consent');
    document.addEventListener('click', function (ev) {
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!a) return;
      var h = a.getAttribute('href') || '';
      if (/wa\\.me|whatsapp\\.com/i.test(h)) window.clarity('event', 'clique_whatsapp');
      else if (/instagram\\.com/i.test(h)) window.clarity('event', 'clique_instagram');
      else if (/^tel:/i.test(h)) window.clarity('event', 'clique_telefone');
    }, true);
  }
  var choice = read();
  if (choice === 'aceitar') start();
  else if (choice !== 'recusar' && banner) banner.hidden = false;
  if (banner) banner.addEventListener('click', function (ev) {
    var v = ev.target && ev.target.getAttribute ? ev.target.getAttribute('data-mawe-cookies') : null;
    if (!v) return;
    save(v);
    banner.hidden = true;
    if (v === 'aceitar') start();
  });
})();
</script>
<!-- fim Mawe Create -->`;
}

export const SITE_SOURCES = ['Google', 'Instagram', 'Direto (digitou o endereço)', 'WhatsApp', 'Facebook', 'Outros'];

/** Mês que costuma ser anotado agora: o anterior até o dia 10, depois o atual. */
export function suggestedMonth(today: ISODate): MonthKey {
  const month = today.slice(0, 7);
  return Number(today.slice(8, 10)) <= 10 ? shiftMonth(month, -1) : month;
}
