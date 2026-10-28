/** Serviços e preços: catálogo do que a agência vende, para os dois sócios cobrarem igual. */
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney, pluralize } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { saveService, serviceIncludes, toggleServiceActive, type ServiceInput } from '../domain/business.ts';
import { SERVICE_CATEGORIES, labelOf, toneOf } from '../domain/labels.ts';
import type { Service, ServiceCategory } from '../domain/types.ts';
import { allowed, requirePermission, rerender, store } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, emptyState, pageHeader, segmented } from '../ui/components.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, openModal, toast } from '../ui/overlay.ts';

const ui = { show: 'ativos' as 'ativos' | 'todos' };

function openServiceForm(service?: Service): void {
  const v: ServiceInput = service ?? { name: '', category: 'site', includes: '', price: 0, billing: 'unico', deliveryDays: null, active: true };
  openModal({
    title: service ? 'Editar serviço' : 'Novo serviço',
    description: 'Os serviços aparecem como opção ao criar propostas e projetos.',
    size: 'lg',
    body: html`
      <form class="form" data-form="service:save" data-id="${service?.id ?? ''}">
        <div class="form-grid">
          ${textField({ name: 'name', label: 'Nome', value: v.name, required: true, autofocus: true, placeholder: 'Ex.: Pacote de feed' })}
          ${selectField({ name: 'category', label: 'Categoria', value: v.category, options: SERVICE_CATEGORIES })}
          ${textField({ name: 'price', label: 'Valor (R$)', value: service ? String(v.price).replace('.', ',') : '', required: true, inputmode: 'decimal' })}
          ${selectField({ name: 'billing', label: 'Cobrança', value: v.billing, options: [{ value: 'unico', label: 'Pagamento único' }, { value: 'mensal', label: 'Mensal' }] })}
          ${textField({ name: 'deliveryDays', label: 'Prazo médio de entrega (dias úteis)', type: 'number', value: v.deliveryDays ?? '', placeholder: 'Ex.: 7' })}
          ${selectField({ name: 'active', label: 'Situação', value: v.active ? 'sim' : 'nao', options: [{ value: 'sim', label: 'Ativo (aparece nas propostas)' }, { value: 'nao', label: 'Desativado' }] })}
        </div>
        ${textareaField({ name: 'includes', label: 'O que está incluso', value: v.includes, rows: 5, hint: 'Um item por linha. Em planos e pacotes, vira o checklist do projeto.' })}
        ${formActions(service ? 'Salvar serviço' : 'Cadastrar serviço')}
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
    const input: ServiceInput = {
      name: values.text('name'),
      category: values.text('category') as ServiceCategory,
      price,
      billing: values.text('billing') as 'unico' | 'mensal',
      deliveryDays: days ? Number(days) : null,
      active: values.text('active') !== 'nao',
      includes: values.text('includes'),
    };
    const id = form.dataset.id || null;
    await store().apply((draft) => saveService(draft, id, input));
    closeModal();
    toast(id ? 'Serviço atualizado.' : 'Serviço cadastrado.');
  },
});

registerActions({
  'service:new': () => openServiceForm(),
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
  const includes = serviceIncludes(s);
  return html`<article class="${cx('service-card', !s.active && 'is-inactive')}">
    <header class="service-card__head">
      <span class="service-card__name">${s.name}</span>
      ${s.active ? '' : badge('Desativado', 'neutral')}
    </header>
    <p class="service-card__price">${formatCurrency(s.price, true)}<small>${s.billing === 'mensal' ? ' /mês' : ' · pagamento único'}</small></p>
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
    const groups = SERVICE_CATEGORIES.map((c) => ({ ...c, items: visible.filter((s) => s.category === c.value).sort((a, b) => a.price - b.price) })).filter((g) => g.items.length);
    return html`
      ${pageHeader({
        title: 'Serviços e preços',
        subtitle: `${pluralize(data.services.length - inactive, 'serviço ativo', 'serviços ativos')} · tabela única para os dois sócios`,
        actions: canEdit ? button({ label: 'Novo serviço', action: 'service:new', variant: 'primary', icon: 'plus' }) : undefined,
      })}
      <div class="toolbar">
        ${segmented({ label: 'Mostrar', action: 'services:show', value: ui.show, items: [{ value: 'ativos', label: 'Ativos' }, { value: 'todos', label: 'Todos', count: data.services.length }] })}
      </div>
      ${groups.length
        ? groups.map(
            (g) => html`<section class="service-group">
              <h2 class="service-group__title">${badge(g.label, toneOf(SERVICE_CATEGORIES, g.value))}<span class="muted small">${pluralize(g.items.length, 'serviço', 'serviços')}</span></h2>
              <div class="service-grid">${g.items.map((s) => serviceCard(s, canEdit))}</div>
            </section>`,
          )
        : html`<div class="panel">${emptyState({
            icon: 'tag',
            title: data.services.length ? 'Nenhum serviço ativo' : 'Nenhum serviço cadastrado',
            text: 'Cadastre o que a agência vende para padronizar preços e montar propostas mais rápido.',
            action: canEdit ? button({ label: 'Novo serviço', action: 'service:new', variant: 'primary', icon: 'plus' }) : undefined,
          })}</div>`}
      <p class="muted small">${icon('info', 13)} ${labelOf(SERVICE_CATEGORIES, 'plano_mensal')} e conteúdo viram projetos com o checklist do que está incluso.</p>
    `;
  },
};
