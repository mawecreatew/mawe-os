/**
 * Marketing da Mawe: seguidores do Instagram mês a mês (com gráfico), ideias
 * de posts, cases do portfólio e de onde vêm os clientes.
 */
import { formatShortDate, monthKey, monthLabel } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { pluralize } from '../core/format.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import type { Route } from '../core/router.ts';
import { referrals } from '../domain/clientcare.ts';
import {
  POST_FORMATS,
  POST_STATUSES,
  caseSuggestions,
  clientOrigins,
  deleteCase,
  deleteInstagramStat,
  deletePostIdea,
  followersByYear,
  instagramGrowth,
  movePostIdea,
  saveCase,
  saveInstagramStat,
  savePostIdea,
} from '../domain/marketing.ts';
import { findClient, findUser } from '../domain/selectors.ts';
import type { InstagramStat, PortfolioCase, PostIdea, PostStatus } from '../domain/types.ts';
import { store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, emptyState, externalLink, pageHeader, panel } from '../ui/components.ts';
import { formActions, selectField, textField, textareaField } from '../ui/forms.ts';
import { icon, type IconName } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

const TABS: Array<{ id: string; label: string; icon: IconName }> = [
  { id: '', label: 'Seguidores', icon: 'chart' },
  { id: 'ideias', label: 'Ideias de posts', icon: 'image' },
  { id: 'cases', label: 'Cases do portfólio', icon: 'layers' },
  { id: 'origem', label: 'De onde vêm os clientes', icon: 'route' },
];

function tabs(active: string): SafeHtml {
  return html`<nav class="subnav subnav--scroll" aria-label="Marketing">
    ${TABS.map((t) => html`<a class="${cx('subnav__item', active === t.id && 'is-active')}" href="#/marketing${t.id ? `/${t.id}` : ''}" ${active === t.id ? html`aria-current="page"` : ''}>${icon(t.icon, 15)} ${t.label}</a>`)}
  </nav>`;
}

function signed(n: number | null): string {
  if (n === null) return '—';
  return `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR')}`;
}

// ---------------------------------------------------------------- Seguidores

const W = 1000;
const H = 220;

function followersChart(stats: InstagramStat[]): SafeHtml {
  if (stats.length < 2) {
    return html`<p class="muted small">${icon('info', 13)} O gráfico aparece a partir do segundo mês anotado.</p>`;
  }
  const values = stats.map((s) => s.followers);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(1, Math.round((max - min) * 0.15));
  const lo = Math.max(0, min - pad);
  const hi = max + pad;
  const x = (i: number) => (i / (stats.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  const points = stats.map((s, i) => `${x(i).toFixed(1)},${y(s.followers).toFixed(1)}`).join(' ');
  const every = Math.max(1, Math.ceil(stats.length / 8));
  return html`<figure class="follow-chart">
    <div class="follow-chart__plot">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Seguidores de ${monthLabel(stats[0].month)} a ${monthLabel(stats.at(-1)!.month)}: de ${values[0]} para ${values.at(-1)}">
        ${[0, 0.5, 1].map((f) => html`<line class="follow-chart__grid" x1="0" x2="${W}" y1="${H * f}" y2="${H * f}" vector-effect="non-scaling-stroke" />`)}
        <polygon class="follow-chart__area" points="0,${H} ${points} ${W},${H}" />
        <polyline class="follow-chart__line" points="${points}" vector-effect="non-scaling-stroke" />
      </svg>
      ${stats.map((s, i) => html`<span class="follow-chart__dot" style="left:${(x(i) / W) * 100}%; bottom:${((H - y(s.followers)) / H) * 100}%" title="${monthLabel(s.month)}: ${s.followers.toLocaleString('pt-BR')} seguidores"></span>`)}
    </div>
    <div class="follow-chart__x" aria-hidden="true">
      ${stats.map((s, i) => (i % every === 0 || i === stats.length - 1 ? html`<span style="left:${(x(i) / W) * 100}%">${monthLabel(s.month)}</span>` : ''))}
    </div>
    <figcaption class="follow-chart__range"><span>${hi.toLocaleString('pt-BR')}</span><span>${lo.toLocaleString('pt-BR')}</span></figcaption>
  </figure>`;
}

function openStatForm(stat?: InstagramStat): void {
  openModal({
    title: stat ? `Números de ${monthLabel(stat.month)}` : 'Anotar números do mês',
    description: 'Abra o Instagram da Mawe › Painel profissional e copie os números do fim do mês.',
    body: html`<form class="form" data-form="stat:save">
      <div class="form-grid">
        ${textField({ name: 'month', label: 'Mês', type: 'month', value: stat?.month ?? monthKey(today()), required: true })}
        ${textField({ name: 'followers', label: 'Seguidores', inputmode: 'numeric', value: stat?.followers ?? '', required: true, autofocus: true, placeholder: 'Ex.: 1.250' })}
        ${textField({ name: 'reach', label: 'Contas alcançadas (30 dias)', inputmode: 'numeric', value: stat?.reach ?? '' })}
        ${textField({ name: 'messages', label: 'Mensagens recebidas no mês', inputmode: 'numeric', value: stat?.messages ?? '' })}
      </div>
      ${formActions('Salvar', stat ? button({ label: 'Apagar mês', action: 'stat:delete', variant: 'ghost', icon: 'trash', data: { month: stat.month } }) : undefined)}
    </form>`,
  });
}

function renderFollowers(): SafeHtml {
  const { data } = store();
  const stats = [...(data.instagramStats ?? [])].sort((a, b) => a.month.localeCompare(b.month));
  const growth = instagramGrowth(data);
  const years = followersByYear(data);
  const month = monthKey(today());
  const missingThisMonth = !stats.some((s) => s.month === month);
  return html`
    ${missingThisMonth ? html`<div class="notice notice--info" role="note"><span class="notice__icon">${icon('info', 18)}</span><div><p class="notice__title">Anote os seguidores de ${monthLabel(month)}</p><p class="notice__text">Um número por mês basta. Daqui a uns anos vocês vão ver toda a evolução da Mawe.</p></div>${button({ label: 'Anotar agora', action: 'stat:new', variant: 'primary', size: 'sm', icon: 'plus' })}</div>` : ''}
    <div class="stat-row">
      <div class="stat"><span class="stat__label">Seguidores hoje</span><span class="stat__value">${growth.last ? growth.last.followers.toLocaleString('pt-BR') : '—'}</span><span class="stat__hint">${growth.last ? `anotado em ${monthLabel(growth.last.month)}` : 'nada anotado ainda'}</span></div>
      <div class="stat"><span class="stat__label">No último mês</span><span class="stat__value">${signed(growth.monthChange)}</span><span class="stat__hint">em relação ao mês anterior anotado</span></div>
      <div class="stat"><span class="stat__label">Em 1 ano</span><span class="stat__value">${signed(growth.yearChange)}</span><span class="stat__hint">mesmo mês do ano passado</span></div>
      <div class="stat"><span class="stat__label">Desde o começo</span><span class="stat__value">${signed(growth.sinceStart)}</span><span class="stat__hint">${stats.length ? `desde ${monthLabel(stats[0].month)}` : ''}</span></div>
    </div>
    ${panel({
      title: 'Evolução dos seguidores',
      icon: 'chart',
      action: button({ label: 'Anotar mês', action: 'stat:new', variant: 'ghost', icon: 'plus', size: 'sm' }),
      body: stats.length
        ? html`${followersChart(stats)}
          ${years.length > 1 ? html`<ul class="year-row">${years.map((y, i) => html`<li><strong>${y.year}</strong><span>${y.followers.toLocaleString('pt-BR')}</span>${i ? html`<small>${signed(y.followers - years[i - 1].followers)}</small>` : ''}</li>`)}</ul>` : ''}
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Mês</th><th class="num">Seguidores</th><th class="num">Variação</th><th class="num">Alcance</th><th class="num">Mensagens</th><th></th></tr></thead>
            <tbody>${[...stats].reverse().map((s, i, list) => {
              const prev = list[i + 1];
              return html`<tr>
                <td>${monthLabel(s.month)}</td>
                <td class="num">${s.followers.toLocaleString('pt-BR')}</td>
                <td class="num">${prev ? signed(s.followers - prev.followers) : '—'}</td>
                <td class="num">${s.reach?.toLocaleString('pt-BR') ?? '—'}</td>
                <td class="num">${s.messages?.toLocaleString('pt-BR') ?? '—'}</td>
                <td>${button({ label: `Editar ${monthLabel(s.month)}`, iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', action: 'stat:edit', data: { month: s.month } })}</td>
              </tr>`;
            })}</tbody>
          </table></div>`
        : emptyState({ icon: 'chart', compact: true, title: 'Nenhum mês anotado', text: 'Comece anotando os seguidores de hoje. É o ponto de partida para comparar daqui a uns anos.', action: button({ label: 'Anotar seguidores', action: 'stat:new', variant: 'primary', size: 'sm', icon: 'plus' }) }),
    })}
  `;
}

// ---------------------------------------------------------------- Ideias de posts

function openPostForm(post?: PostIdea): void {
  openModal({
    title: post ? 'Editar ideia de post' : 'Nova ideia de post',
    body: html`<form class="form" data-form="post-idea:save" data-id="${post?.id ?? ''}">
      ${textField({ name: 'title', label: 'Ideia', value: post?.title, required: true, autofocus: true, placeholder: 'Ex.: Antes e depois do site da hamburgueria' })}
      <div class="form-grid">
        ${textField({ name: 'format', label: 'Formato', value: post?.format ?? 'Reels', suggestions: POST_FORMATS })}
        ${textField({ name: 'date', label: 'Data para postar', type: 'date', value: post?.date ?? '' })}
        ${selectField({ name: 'status', label: 'Situação', value: post?.status ?? 'ideia', options: POST_STATUSES })}
      </div>
      ${textareaField({ name: 'notes', label: 'Roteiro ou legenda', value: post?.notes, rows: 4 })}
      ${formActions(post ? 'Salvar' : 'Criar ideia', post ? button({ label: 'Apagar', action: 'post-idea:delete', variant: 'ghost', icon: 'trash', data: { id: post.id } }) : undefined)}
    </form>`,
  });
}

function renderIdeas(): SafeHtml {
  const { data } = store();
  const posts = data.postIdeas ?? [];
  return panel({
    title: 'Ideias de posts do Instagram da Mawe',
    icon: 'image',
    action: button({ label: 'Nova ideia', action: 'post-idea:new', variant: 'ghost', icon: 'plus', size: 'sm' }),
    body: posts.length
      ? html`<div class="mini-board mini-board--4">
          ${POST_STATUSES.map((s, si) => {
            const list = posts
              .filter((p) => p.status === s.value)
              .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || b.createdAt.localeCompare(a.createdAt))
              .slice(0, s.value === 'postado' ? 12 : 50);
            return html`<section class="mini-board__col">
              <h3 class="mini-board__title">${s.label} <span class="panel__count">${posts.filter((p) => p.status === s.value).length}</span></h3>
              ${list.map(
                (p) => html`<article class="mini-card">
                  <button type="button" class="mini-card__title" data-action="post-idea:edit" data-id="${p.id}">${p.title}</button>
                  <p class="mini-card__text">${[p.format, p.date ? formatShortDate(p.date) : ''].filter(Boolean).join(' · ')}</p>
                  <footer class="mini-card__foot">
                    <small class="muted">${findUser(data, p.authorId)?.shortName.split(' ')[0] ?? ''}</small>
                    <span>
                      ${si > 0 ? button({ label: `Voltar para ${POST_STATUSES[si - 1].label}`, iconOnly: true, icon: 'arrowLeft', variant: 'ghost', size: 'sm', action: 'post-idea:move', data: { id: p.id, status: POST_STATUSES[si - 1].value } }) : ''}
                      ${si < POST_STATUSES.length - 1 ? button({ label: `Mover para ${POST_STATUSES[si + 1].label}`, iconOnly: true, icon: 'arrowRight', variant: 'ghost', size: 'sm', action: 'post-idea:move', data: { id: p.id, status: POST_STATUSES[si + 1].value } }) : ''}
                    </span>
                  </footer>
                </article>`,
              )}
            </section>`;
          })}
        </div>
        <p class="panel__foot">${icon('info', 13)} Posts marcados como postados contam na meta de posts do mês (Planejamento). Para posts de clientes, use o <a href="#/calendario">Calendário de conteúdo</a>.</p>`
      : emptyState({ icon: 'image', compact: true, title: 'Nenhuma ideia de post ainda', text: 'Bastidores, antes e depois, dicas para pequenos negócios, depoimentos... Anote aqui para nunca faltar assunto.', action: button({ label: 'Nova ideia', action: 'post-idea:new', variant: 'secondary', size: 'sm', icon: 'plus' }) }),
  });
}

// ---------------------------------------------------------------- Cases

const CASE_STATUSES = [
  { value: 'rascunho', label: 'Rascunho' },
  { value: 'pronto', label: 'Pronto para postar' },
  { value: 'postado', label: 'Postado' },
];

function openCaseForm(item?: PortfolioCase, preset?: { projectId: string }): void {
  const { data } = store();
  const project = preset ? data.projects.find((p) => p.id === preset.projectId) : undefined;
  openModal({
    title: item ? 'Editar case' : 'Novo case do portfólio',
    description: 'Como era antes, o que vocês fizeram e o resultado. Pronto para virar post.',
    size: 'lg',
    body: html`<form class="form" data-form="case:save" data-id="${item?.id ?? ''}">
      <div class="form-grid">
        ${textField({ name: 'title', label: 'Nome do case', value: item?.title ?? (project ? project.name : ''), required: true, autofocus: true })}
        ${selectField({ name: 'clientId', label: 'Cliente', value: item?.clientId ?? project?.clientId ?? '', emptyLabel: 'Nenhum', options: data.clients.map((c) => ({ value: c.id, label: c.company })) })}
        ${selectField({ name: 'projectId', label: 'Projeto', value: item?.projectId ?? project?.id ?? '', emptyLabel: 'Nenhum', options: data.projects.map((p) => ({ value: p.id, label: p.name })) })}
        ${selectField({ name: 'status', label: 'Situação', value: item?.status ?? 'rascunho', options: CASE_STATUSES })}
        ${textField({ name: 'link', label: 'Link do site', type: 'url', value: item?.link ?? project?.links.production ?? '', className: 'form-grid__full' })}
      </div>
      ${textareaField({ name: 'before', label: 'Antes', value: item?.before, rows: 2, placeholder: 'Ex.: Só tinha Instagram, clientes pediam cardápio pelo direct' })}
      ${textareaField({ name: 'after', label: 'O que fizemos', value: item?.after, rows: 2, placeholder: 'Ex.: Site one page com cardápio e botão de WhatsApp' })}
      ${textareaField({ name: 'result', label: 'Resultado', value: item?.result, rows: 2, placeholder: 'Ex.: Pedidos organizados, menos perguntas repetidas' })}
      ${formActions(item ? 'Salvar' : 'Criar case', item ? button({ label: 'Apagar', action: 'case:delete', variant: 'ghost', icon: 'trash', data: { id: item.id } }) : undefined)}
    </form>`,
  });
}

function renderCases(): SafeHtml {
  const { data } = store();
  const cases = [...(data.cases ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const suggestions = caseSuggestions(data);
  return html`
    ${suggestions.length
      ? panel({
          title: 'Sites entregues que ainda não viraram case',
          icon: 'flag',
          body: html`<ul class="link-rows">${suggestions.map((s) => html`<li><span><strong>${s.name}</strong> <small class="muted">${s.client}</small></span>${button({ label: 'Criar case', action: 'case:new', size: 'sm', icon: 'plus', data: { project: s.projectId } })}</li>`)}</ul>`,
        })
      : ''}
    ${panel({
      title: 'Cases do portfólio',
      icon: 'layers',
      count: cases.length,
      action: button({ label: 'Novo case', action: 'case:new', variant: 'ghost', icon: 'plus', size: 'sm' }),
      body: cases.length
        ? html`<div class="case-grid">${cases.map((c) => {
            const client = findClient(data, c.clientId);
            return html`<article class="case-card">
              <header><button type="button" class="case-card__title" data-action="case:edit" data-id="${c.id}">${c.title}</button>${badge(CASE_STATUSES.find((s) => s.value === c.status)?.label ?? '', c.status === 'postado' ? 'success' : c.status === 'pronto' ? 'accent' : 'neutral')}</header>
              ${client ? html`<p class="muted small">${client.company}</p>` : ''}
              <dl class="case-card__steps">
                ${c.before ? html`<div><dt>Antes</dt><dd>${multiline(c.before)}</dd></div>` : ''}
                ${c.after ? html`<div><dt>O que fizemos</dt><dd>${multiline(c.after)}</dd></div>` : ''}
                ${c.result ? html`<div><dt>Resultado</dt><dd>${multiline(c.result)}</dd></div>` : ''}
              </dl>
              ${c.link ? externalLink(c.link, 'Ver o site') : ''}
            </article>`;
          })}</div>`
        : emptyState({ icon: 'layers', compact: true, title: 'Nenhum case ainda', text: 'Cada site entregue pode virar um post de antes e depois. É a melhor prova para quem ainda não conhece a Mawe.' }),
    })}
  `;
}

// ---------------------------------------------------------------- Origem

function renderOrigins(): SafeHtml {
  const { data } = store();
  const rows = clientOrigins(data);
  const refs = referrals(data);
  return html`
    ${panel({
      title: 'De onde vêm os clientes e os leads',
      icon: 'route',
      body: rows.length
        ? html`<div class="table-wrap"><table class="table">
            <thead><tr><th>Origem</th><th class="num">Clientes</th><th class="num">Leads</th><th class="num">Leads que fecharam</th><th class="num">Conversão</th></tr></thead>
            <tbody>${rows.map((r) => html`<tr><td>${r.source}</td><td class="num">${r.clients}</td><td class="num">${r.leads}</td><td class="num">${r.won}</td><td class="num">${r.leads ? `${Math.round((r.won / r.leads) * 100)}%` : '—'}</td></tr>`)}</tbody>
          </table></div>
          <p class="panel__foot">${icon('info', 13)} A origem do cliente vem do lead que virou cliente ou do que vocês anotarem em Cliente › Origem e indicação.</p>`
        : emptyState({ icon: 'route', compact: true, title: 'Ainda sem dados', text: 'Cadastre leads com a origem (Google Maps, Instagram, Indicação...) e ela aparece aqui.' }),
    })}
    ${panel({
      title: 'Quem indicou quem',
      icon: 'clients',
      body: refs.length
        ? html`<ul class="ref-list">${refs.map(
            (r) => html`<li><strong>${r.whoId ? html`<a href="#/clientes/${r.whoId}">${r.who}</a>` : r.who}</strong> indicou ${pluralize(r.referred.length, 'cliente', 'clientes')}:
              ${r.referred.map((c, i) => html`${i ? ', ' : ' '}<a href="#/clientes/${c.id}">${c.company}</a>`)}</li>`,
          )}</ul>
          <p class="panel__foot">${icon('info', 13)} Agradeça cada indicação. Um desconto na próxima manutenção ou um presente simples faz a pessoa indicar de novo.</p>`
        : emptyState({ icon: 'clients', compact: true, title: 'Nenhuma indicação anotada', text: 'Na ficha do cliente, em Origem e indicação, marque quem indicou.' }),
    })}
  `;
}

export const marketingView: View = {
  title: () => 'Instagram da Mawe',
  render: (route: Route) => {
    const tab = TABS.some((t) => t.id === route.params[0]) ? route.params[0] : '';
    const body = tab === 'ideias' ? renderIdeas() : tab === 'cases' ? renderCases() : tab === 'origem' ? renderOrigins() : renderFollowers();
    return html`
      ${pageHeader({ title: 'Marketing da Mawe', subtitle: 'O Instagram da agência, as ideias de posts, os cases e de onde vêm os clientes.' })}
      ${tabs(tab ?? '')}
      ${body}
    `;
  },
};

// ---------------------------------------------------------------- Ações

function intOrNull(text: string): number | null {
  if (!text) return null;
  const n = Number(text.replace(/[.\s]/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error('Use apenas números.');
  return Math.round(n);
}

registerForms({
  'stat:save': async (_form, values) => {
    const followers = intOrNull(values.text('followers'));
    if (followers === null) throw new Error('Informe o número de seguidores.');
    await store().apply((draft) => saveInstagramStat(draft, { month: values.text('month'), followers, reach: intOrNull(values.text('reach')), messages: intOrNull(values.text('messages')) }));
    closeModal();
    toast('Números do mês salvos.');
  },
  'post-idea:save': async (form, values) => {
    const id = form.dataset.id || null;
    await store().apply((draft, ctx) =>
      savePostIdea(draft, id, { title: values.text('title'), format: values.text('format'), notes: values.text('notes'), date: values.optional('date'), status: values.text('status') as PostStatus }, ctx),
    );
    closeModal();
    toast(id ? 'Ideia salva.' : 'Ideia de post criada.');
  },
  'case:save': async (form, values) => {
    const id = form.dataset.id || null;
    await store().apply((draft, ctx) =>
      saveCase(
        draft,
        id,
        {
          title: values.text('title'),
          clientId: values.optional('clientId'),
          projectId: values.optional('projectId'),
          before: values.text('before'),
          after: values.text('after'),
          result: values.text('result'),
          link: values.text('link'),
          status: values.text('status') as PortfolioCase['status'],
        },
        ctx,
      ),
    );
    closeModal();
    toast(id ? 'Case salvo.' : 'Case criado.');
  },
});

registerActions({
  'stat:new': () => openStatForm(),
  'stat:edit': (el) => {
    const stat = (store().data.instagramStats ?? []).find((s) => s.month === el.dataset.month);
    if (stat) openStatForm(stat);
  },
  'stat:delete': async (el) => {
    const ok = await confirmAction({ title: 'Apagar este mês?', text: 'Os números deste mês somem do gráfico.', confirmLabel: 'Apagar' });
    if (!ok) return;
    await store().apply((draft) => deleteInstagramStat(draft, el.dataset.month!));
    toast('Mês apagado.');
  },
  'post-idea:new': () => openPostForm(),
  'post-idea:edit': (el) => {
    const post = (store().data.postIdeas ?? []).find((p) => p.id === el.dataset.id);
    if (post) openPostForm(post);
  },
  'post-idea:move': async (el) => {
    await store().apply((draft) => movePostIdea(draft, el.dataset.id!, el.dataset.status as PostStatus, today()));
  },
  'post-idea:delete': async (el) => {
    const ok = await confirmAction({ title: 'Apagar ideia de post?', text: 'A ideia some do quadro.', confirmLabel: 'Apagar' });
    if (!ok) return;
    await store().apply((draft) => deletePostIdea(draft, el.dataset.id!));
    toast('Ideia apagada.');
  },
  'case:new': (el) => openCaseForm(undefined, el.dataset.project ? { projectId: el.dataset.project } : undefined),
  'case:edit': (el) => {
    const item = (store().data.cases ?? []).find((c) => c.id === el.dataset.id);
    if (item) openCaseForm(item);
  },
  'case:delete': async (el) => {
    const ok = await confirmAction({ title: 'Apagar case?', text: 'O case some do portfólio.', confirmLabel: 'Apagar' });
    if (!ok) return;
    await store().apply((draft) => deleteCase(draft, el.dataset.id!));
    toast('Case apagado.');
  },
});
