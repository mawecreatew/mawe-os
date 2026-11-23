/** Kit da agência: orçamento rápido, links do portfólio e atalho para as ideias. */
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import type { Route } from '../core/router.ts';
import { effectivePrice, promoActive } from '../domain/business.ts';
import { quickQuote, quoteMessage } from '../domain/kit.ts';
import { PORTFOLIO_KINDS, deletePortfolioLink, portfolioLinks, savePortfolioLink } from '../domain/marketing.ts';
import type { PortfolioLink } from '../domain/types.ts';
import { rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, emptyState, pageHeader, panel } from '../ui/components.ts';
import { formActions, selectField, textField } from '../ui/forms.ts';
import { icon, type IconName } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

const ui = { picked: new Set<string>(), discount: 0, client: '' };

const TABS: Array<{ id: string; label: string; icon: IconName }> = [
  { id: '', label: 'Orçamento rápido', icon: 'money' },
  { id: 'portfolio', label: 'Portfólio', icon: 'link' },
];

function tabs(active: string): SafeHtml {
  return html`<nav class="subnav" aria-label="Kit">
    ${TABS.map((t) => html`<a class="${cx('subnav__item', active === t.id && 'is-active')}" href="#/kit${t.id ? `/${t.id}` : ''}" ${active === t.id ? html`aria-current="page"` : ''}>${icon(t.icon, 15)} ${t.label}</a>`)}
    <a class="subnav__item" href="#/planejamento">${icon('layers', 15)} Ideias (no Planejamento)</a>
  </nav>`;
}

function renderQuote(): SafeHtml {
  const { data } = store();
  const t = today();
  const services = data.services.filter((s) => s.active).sort((a, b) => (a.billing === b.billing ? a.price - b.price : a.billing === 'unico' ? -1 : 1));
  const q = quickQuote(data, [...ui.picked], ui.discount, t);
  return html`<div class="detail-grid">
    <div class="detail-grid__main">
      ${panel({
        title: 'Escolha o que vai no orçamento',
        icon: 'tag',
        action: html`<a class="panel__link" href="#/servicos">Editar preços ${icon('arrowRight', 14)}</a>`,
        body: services.length
          ? html`
            <div class="field"><label class="field__label" for="quote-client">Nome do cliente</label>
              <input class="input" id="quote-client" value="${ui.client}" placeholder="Ex.: Barbearia do João" data-input="quote:client" autocomplete="off" /></div>
            <ul class="quote-list">${services.map((s) => {
              const promo = promoActive(s, t);
              return html`<li><label class="${cx('quote-item', ui.picked.has(s.id) && 'is-on')}">
                <input type="checkbox" class="check" ${ui.picked.has(s.id) ? 'checked' : ''} data-change="quote:pick" data-id="${s.id}" />
                <span class="quote-item__main"><strong>${s.name}</strong><small>${s.includes.split('\n')[0] ?? ''}</small></span>
                <span class="quote-item__price">${promo ? html`<s>${formatCurrency(s.price, true)}</s> ` : ''}${formatCurrency(effectivePrice(s, t), true)}${s.billing === 'mensal' ? '/mês' : ''}${promo && s.promoLabel ? html` ${badge(s.promoLabel, 'accent')}` : ''}</span>
              </label></li>`;
            })}</ul>
            <div class="field field--inline"><label class="field__label" for="quote-discount">Desconto no valor único (%)</label>
              <input class="input input--short" id="quote-discount" type="number" min="0" max="50" value="${ui.discount || ''}" placeholder="0" data-change="quote:discount" /></div>`
          : emptyState({ icon: 'tag', compact: true, title: 'Nenhum serviço ativo', text: 'Cadastre os serviços e preços para montar orçamentos rápidos.', action: html`<a class="btn btn--secondary btn--sm" href="#/servicos">Abrir Serviços e preços</a>` }),
      })}
    </div>
    <aside class="detail-grid__side">
      ${panel({
        title: 'Total',
        icon: 'money',
        className: 'quote-total',
        body: html`
          <p class="quote-total__value">${formatCurrency(q.total, true)}</p>
          ${q.discount ? html`<p class="muted small">${formatCurrency(q.oneTime, true)} com ${formatCurrency(q.discount, true)} de desconto</p>` : ''}
          ${q.monthly ? html`<p class="quote-total__monthly">+ ${formatCurrency(q.monthly, true)}/mês</p>` : ''}
          <div class="quick-actions">
            ${button({ label: 'Copiar mensagem', action: 'quote:copy', icon: 'copy', variant: 'primary' })}
            ${button({ label: 'Virar proposta', action: 'quote:proposal', icon: 'file' })}
            ${q.services.length ? button({ label: 'Limpar', action: 'quote:clear', variant: 'ghost' }) : ''}
          </div>
          <p class="muted small">A mensagem lista o que está incluso em cada serviço e a forma de pagamento dos Dados da agência.</p>
        `,
      })}
    </aside>
  </div>`;
}

function openLinkForm(link?: PortfolioLink): void {
  openModal({
    title: link ? 'Editar link' : 'Novo link do portfólio',
    body: html`<form class="form" data-form="portfolio:save" data-id="${link?.id ?? ''}">
      ${textField({ name: 'title', label: 'Nome', value: link?.title, required: true, autofocus: true, placeholder: 'Ex.: Demo barbearia' })}
      ${textField({ name: 'url', label: 'Endereço', type: 'url', value: link?.url, required: true, placeholder: 'https://' })}
      <div class="form-grid">
        ${selectField({ name: 'kind', label: 'Tipo', value: link?.kind ?? 'demo', options: PORTFOLIO_KINDS })}
        ${textField({ name: 'niche', label: 'Nicho', value: link?.niche, placeholder: 'Ex.: Barbearia' })}
      </div>
      ${formActions(link ? 'Salvar' : 'Adicionar', link ? button({ label: 'Apagar', action: 'portfolio:delete', variant: 'ghost', icon: 'trash', data: { id: link.id } }) : undefined)}
    </form>`,
  });
}

function renderPortfolio(): SafeHtml {
  const { data } = store();
  const links = portfolioLinks(data);
  return panel({
    title: 'Links para mandar na prospecção',
    icon: 'link',
    action: button({ label: 'Novo link', action: 'portfolio:new', variant: 'ghost', icon: 'plus', size: 'sm' }),
    body: links.length
      ? html`<ul class="portfolio-list">${links.map(
          (l) => html`<li class="portfolio-row">
            <span class="portfolio-row__main">
              <small>${PORTFOLIO_KINDS.find((k) => k.value === l.kind)?.label ?? ''}${l.niche ? ` · ${l.niche}` : ''}${l.auto ? ' · publicado pela Mawe' : ''}</small>
              <strong>${l.title}</strong>
              <span class="portfolio-row__url">${l.url}</span>
            </span>
            ${button({ label: 'Copiar', action: 'portfolio:copy', icon: 'copy', size: 'sm', variant: 'primary', data: { url: l.url } })}
            ${l.auto ? '' : button({ label: `Editar ${l.title}`, iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', action: 'portfolio:edit', data: { id: l.id } })}
          </li>`,
        )}</ul>
        <p class="panel__foot">${icon('info', 13)} Na hora de prospectar, mande o link do mesmo nicho do lead.</p>`
      : emptyState({ icon: 'link', compact: true, title: 'Nenhum link ainda', text: 'Guarde as demos e os sites prontos. Sites publicados de clientes entram aqui sozinhos.' }),
  });
}

export const kitView: View = {
  title: () => 'Kit da agência',
  render: (route: Route) => {
    const tab = route.params[0] === 'portfolio' ? 'portfolio' : '';
    return html`
      ${pageHeader({ title: 'Kit da agência', subtitle: 'O que vocês usam toda hora na prospecção: orçamento rápido e portfólio.' })}
      ${tabs(tab)}
      ${tab === 'portfolio' ? renderPortfolio() : renderQuote()}
    `;
  },
};

async function copy(text: string, ok: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(ok);
  } catch {
    toast('Não foi possível copiar automaticamente.', 'error');
  }
}

registerForms({
  'portfolio:save': async (form, values) => {
    const id = form.dataset.id || null;
    await store().apply((draft) => savePortfolioLink(draft, id, { title: values.text('title'), url: values.text('url'), kind: values.text('kind') as PortfolioLink['kind'], niche: values.text('niche') }));
    closeModal();
    toast(id ? 'Link salvo.' : 'Link adicionado.');
  },
});

registerActions({
  'quote:pick': (el) => {
    const id = el.dataset.id!;
    if ((el as HTMLInputElement).checked) ui.picked.add(id);
    else ui.picked.delete(id);
    rerender();
  },
  'quote:discount': (el) => {
    const n = parseMoney((el as HTMLInputElement).value) ?? 0;
    ui.discount = Math.min(50, Math.max(0, n));
    rerender();
  },
  'quote:client': (el) => {
    ui.client = (el as HTMLInputElement).value;
  },
  'quote:clear': () => {
    ui.picked.clear();
    ui.discount = 0;
    rerender();
  },
  'quote:copy': async () => {
    const { data } = store();
    const q = quickQuote(data, [...ui.picked], ui.discount, today());
    if (!q.services.length) {
      toast('Escolha pelo menos um serviço.', 'error');
      return;
    }
    await copy(quoteMessage(data, q, ui.client, today()), 'Orçamento copiado. Revise antes de mandar.');
  },
  'quote:proposal': () => {
    toast('Na proposta, escolha os mesmos serviços. Ela gera o PDF e o contrato.', 'info');
    window.location.hash = '#/comercial/propostas';
  },
  'portfolio:new': () => openLinkForm(),
  'portfolio:edit': (el) => {
    const link = (store().data.portfolioLinks ?? []).find((l) => l.id === el.dataset.id);
    if (link) openLinkForm(link);
  },
  'portfolio:delete': async (el) => {
    const ok = await confirmAction({ title: 'Apagar link?', text: 'O link sai do portfólio.', confirmLabel: 'Apagar' });
    if (!ok) return;
    await store().apply((draft) => deletePortfolioLink(draft, el.dataset.id!));
    toast('Link apagado.');
  },
  'portfolio:copy': (el) => copy(el.dataset.url!, 'Link copiado.'),
});
