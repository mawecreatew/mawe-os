/** Serviços e preços: catálogo do que a agência vende, para os dois sócios cobrarem igual. */
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney, pluralize } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { formatShortDate } from '../core/dates.ts';
import { effectivePrice, packageSeparatePrice, promoActive, saveService, serviceIncludes, toggleServiceActive, type ServiceInput } from '../domain/business.ts';
import { categories, serviceCategoryOptions } from '../domain/categories.ts';
import type { Service, ServiceCategory } from '../domain/types.ts';
import { allowed, requirePermission, rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, emptyState, pageHeader, segmented } from '../ui/components.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, openModal, toast } from '../ui/overlay.ts';

const ui = { show: 'ativos' as 'ativos' | 'todos' };

function money(n: number | null | undefined): string {
  return n === null || n === undefined ? '' : String(n).replace('.', ',');
}

function openServiceForm(service?: Service, preset: Partial<ServiceInput> = {}): void {
  const { data } = store();
  const v: ServiceInput = service ?? { name: '', category: categories(data, 'servico')[0]?.id ?? 'outro', includes: '', price: 0, billing: 'unico', deliveryDays: null, active: true, promoPrice: null, promoUntil: null, promoLabel: '', packageItems: [], ...preset };
  const others = data.services.filter((s) => s.id !== service?.id && (s.active || v.packageItems?.includes(s.id)) && !(s.packageItems ?? []).length);
  openModal({
    title: service ? 'Editar serviço' : 'Novo serviço',
    description: 'Os serviços aparecem como opção ao criar propostas e projetos.',
    size: 'lg',
    body: html`
      <form class="form" data-form="service:save" data-id="${service?.id ?? ''}">
        <div class="form-grid">
          ${textField({ name: 'name', label: 'Nome', value: v.name, required: true, autofocus: true, placeholder: 'Ex.: Pacote de feed' })}
          ${selectField({ name: 'category', label: 'Categoria', value: v.category, options: serviceCategoryOptions(data, v.category), hint: 'Falta alguma? Crie em Categorias (menu lateral).' })}
          ${textField({ name: 'price', label: 'Valor (R$)', value: service ? money(v.price) : '', required: true, inputmode: 'decimal' })}
          ${selectField({ name: 'billing', label: 'Cobrança', value: v.billing, options: [{ value: 'unico', label: 'Pagamento único' }, { value: 'mensal', label: 'Mensal' }] })}
          ${textField({ name: 'deliveryDays', label: 'Prazo médio de entrega (dias úteis)', type: 'number', value: v.deliveryDays ?? '', placeholder: 'Ex.: 7' })}
          ${selectField({ name: 'active', label: 'Situação', value: v.active ? 'sim' : 'nao', options: [{ value: 'sim', label: 'Ativo (aparece nas propostas)' }, { value: 'nao', label: 'Desativado' }] })}
        </div>
        ${textareaField({ name: 'includes', label: 'O que está incluso', value: v.includes, rows: 5, hint: 'Um item por linha. Em planos e pacotes, vira o checklist do projeto.' })}
        <fieldset class="field promo-fields">
          <legend class="field__label">Promoção (opcional)</legend>
          <div class="form-grid form-grid--3">
            ${textField({ name: 'promoPrice', label: 'Preço promocional (R$)', value: money(v.promoPrice), inputmode: 'decimal', placeholder: 'Ex.: 350' })}
            ${textField({ name: 'promoUntil', label: 'Vale até', type: 'date', value: v.promoUntil ?? '' })}
            ${textField({ name: 'promoLabel', label: 'Nome da promoção', value: v.promoLabel ?? '', placeholder: 'Ex.: Black Friday' })}
          </div>
          <p class="field__hint">Depois da data, o preço volta sozinho ao normal. Nas propostas entra o preço que estiver valendo no dia.</p>
        </fieldset>
        ${others.length
          ? html`<fieldset class="field">
              <legend class="field__label">É um pacote? Marque o que vem junto (opcional)</legend>
              <div class="check-grid">${others.map(
                (o) => html`<label class="check-item"><input type="checkbox" class="check" name="packageItems" value="${o.id}" ${v.packageItems?.includes(o.id) ? 'checked' : ''} /> <span>${o.name} <small class="muted">${formatCurrency(o.price, true)}</small></span></label>`,
              )}</div>
              <p class="field__hint">O card mostra quanto o cliente economiza em relação a contratar separado.</p>
            </fieldset>`
          : ''}
        ${formActions(service ? 'Salvar serviço' : 'Cadastrar serviço', service ? button({ label: 'Duplicar', action: 'service:duplicate', variant: 'ghost', icon: 'copy', size: 'sm', data: { id: service.id } }) : undefined)}
      </form>
    `,
  });
}

registerForms({
  'service:save': async (form, values) => {
    requirePermission('finance:edit');
    const price = parseMoney(values.text('price'));
    if (price === null || price < 0) throw new Error('Informe o valor do serviço.');
    const days = values.text('deliveryDays');
    const promoPrice = parseMoney(values.text('promoPrice'));
    const input: ServiceInput = {
      name: values.text('name'),
      category: values.text('category') as ServiceCategory,
      price,
      billing: values.text('billing') as 'unico' | 'mensal',
      deliveryDays: days ? Number(days) : null,
      active: values.text('active') !== 'nao',
      includes: values.text('includes'),
      promoPrice,
      promoUntil: promoPrice === null ? null : values.optional('promoUntil'),
      promoLabel: promoPrice === null ? '' : values.text('promoLabel'),
      packageItems: values.all('packageItems'),
    };
    const id = form.dataset.id || null;
    await store().apply((draft) => saveService(draft, id, input));
    closeModal();
    toast(id ? 'Serviço atualizado.' : 'Serviço cadastrado.');
  },
});

registerActions({
  'service:new': () => openServiceForm(),
  'service:duplicate': (el) => {
    const s = store().data.services.find((x) => x.id === el.dataset.id);
    if (s) openServiceForm(undefined, { ...s, name: `${s.name} (cópia)`, packageItems: [...(s.packageItems ?? [])] });
  },
  'service:edit': (el) => {
    const s = store().data.services.find((x) => x.id === el.dataset.id);
    if (s) openServiceForm(s);
  },
  'service:toggle': async (el) => {
    requirePermission('finance:edit');
    await store().apply((draft) => toggleServiceActive(draft, el.dataset.id!));
    const s = store().data.services.find((x) => x.id === el.dataset.id);
    toast(s?.active ? 'Serviço ativado.' : 'Serviço desativado (continua salvo).');
  },
  'services:show': (el) => {
    ui.show = el.dataset.value as typeof ui.show;
    rerender();
  },
});

function serviceCard(s: Service, canEdit: boolean): SafeHtml {
  const { data } = store();
  const t = today();
  const includes = serviceIncludes(s);
  const promo = promoActive(s, t);
  const separate = packageSeparatePrice(data, s);
  const items = (s.packageItems ?? []).map((id) => data.services.find((x) => x.id === id)?.name).filter(Boolean) as string[];
  const price = effectivePrice(s, t);
  return html`<article class="${cx('service-card', !s.active && 'is-inactive', promo && 'has-promo')}">
    <header class="service-card__head">
      <span class="service-card__name">${s.name}</span>
      ${s.active ? '' : badge('Desativado', 'neutral')}
      ${promo ? badge(s.promoLabel || 'Promoção', 'accent') : ''}
    </header>
    <p class="service-card__price">
      ${promo ? html`<s class="service-card__old">${formatCurrency(s.price, true)}</s> ` : ''}${formatCurrency(price, true)}<small>${s.billing === 'mensal' ? ' /mês' : ' · pagamento único'}</small>
    </p>
    ${promo && s.promoUntil ? html`<p class="service-card__promo">${icon('clock', 13)} Promoção até ${formatShortDate(s.promoUntil)}</p>` : ''}
    ${items.length ? html`<p class="service-card__pack">${icon('layers', 13)} Inclui: ${items.join(' + ')}</p>` : ''}
    ${separate !== null && separate > price ? html`<p class="service-card__save">Separado sairia ${formatCurrency(separate, true)} · economia de ${formatCurrency(separate - price, true)}</p>` : ''}
    ${includes.length ? html`<ul class="bullet-list bullet-list--check">${includes.map((i) => html`<li>${i}</li>`)}</ul>` : html`<p class="muted small">Sem descrição do que está incluso.</p>`}
    <footer class="service-card__foot">
      <span class="muted small">${s.deliveryDays !== null ? html`${icon('clock', 13)} ~${s.deliveryDays} ${s.deliveryDays === 1 ? 'dia útil' : 'dias úteis'}` : s.billing === 'mensal' ? 'Contínuo' : ''}</span>
      ${canEdit
        ? html`<span class="button-row">
            ${button({ label: s.active ? 'Desativar' : 'Ativar', action: 'service:toggle', size: 'sm', variant: 'ghost', data: { id: s.id } })}
            ${button({ label: 'Editar', action: 'service:edit', size: 'sm', icon: 'edit', data: { id: s.id } })}
          </span>`
        : ''}
    </footer>
  </article>`;
}

export const servicesView: View = {
  title: () => 'Serviços e preços',
  render: () => {
    const { data } = store();
    const canEdit = allowed('finance:edit');
    const visible = data.services.filter((s) => ui.show === 'todos' || s.active);
    const inactive = data.services.filter((s) => !s.active).length;
    const all = categories(data, 'servico', true);
    const groups = all
      .map((c) => ({ value: c.id, label: c.label, tone: c.tone, items: visible.filter((s) => s.category === c.id).sort((a, b) => a.price - b.price) }))
      .filter((g) => g.items.length);
    const orphans = visible.filter((s) => !all.some((c) => c.id === s.category));
    if (orphans.length) groups.push({ value: 'sem', label: 'Sem categoria', tone: 'neutral', items: orphans });
    const promos = data.services.filter((s) => s.active && promoActive(s, today())).length;
    return html`
      ${pageHeader({
        title: 'Serviços e preços',
        subtitle: `${pluralize(data.services.length - inactive, 'serviço ativo', 'serviços ativos')}${promos ? ` · ${pluralize(promos, 'promoção valendo', 'promoções valendo')}` : ''} · tabela única para os dois sócios`,
        actions: canEdit
          ? html`<a class="btn btn--secondary" href="#/categorias/servico">${icon('tag', 16)}<span>Categorias</span></a>${button({ label: 'Novo serviço', action: 'service:new', variant: 'primary', icon: 'plus' })}`
          : undefined,
      })}
      <div class="toolbar">
        ${segmented({ label: 'Mostrar', action: 'services:show', value: ui.show, items: [{ value: 'ativos', label: 'Ativos' }, { value: 'todos', label: 'Todos', count: data.services.length }] })}
      </div>
      ${groups.length
        ? groups.map(
            (g) => html`<section class="service-group">
              <h2 class="service-group__title">${badge(g.label, g.tone)}<span class="muted small">${pluralize(g.items.length, 'serviço', 'serviços')}</span></h2>
              <div class="service-grid">${g.items.map((s) => serviceCard(s, canEdit))}</div>
            </section>`,
          )
        : html`<div class="panel">${emptyState({
            icon: 'tag',
            title: data.services.length ? 'Nenhum serviço ativo' : 'Nenhum serviço cadastrado',
            text: 'Cadastre o que a agência vende para padronizar preços e montar propostas mais rápido.',
            action: canEdit ? button({ label: 'Novo serviço', action: 'service:new', variant: 'primary', icon: 'plus' }) : undefined,
          })}</div>`}
      <p class="muted small">${icon('info', 13)} Planos mensais, design e conteúdo viram projetos com o checklist do que está incluso. Para cobrar um plano todo mês, ative-o na ficha do cliente.</p>
    `;
  },
};
