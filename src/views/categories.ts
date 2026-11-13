/** Categorias: as listas que os sócios editam (serviços, despesas, origens, nichos, motivos de perda). */
import { registerActions, registerForms } from '../core/events.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import {
  CATEGORY_GROUPS,
  addCategory,
  categories,
  categoryUsage,
  moveCategory,
  renameCategory,
  setCategoryTone,
  toggleCategoryArchived,
} from '../domain/categories.ts';
import { STAGE_TONES } from '../domain/labels.ts';
import type { CategoryGroup, Tone } from '../domain/types.ts';
import { allowed, requirePermission, rerender, store } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, pageHeader, segmented } from '../ui/components.ts';
import { icon } from '../ui/icons.ts';
import { toast } from '../ui/overlay.ts';

const ui = { group: 'servico' as CategoryGroup };

/** Abre a tela já na lista certa (ex.: link "gerenciar categorias" do formulário de serviço). */
export function categoriesHref(group: CategoryGroup): string {
  return `#/categorias/${group}`;
}

const TONES: Array<{ value: Tone; label: string }> = [...STAGE_TONES, { value: 'success', label: 'Verde' }, { value: 'danger', label: 'Vermelho' }];

registerForms({
  'category:add': async (form, values) => {
    requirePermission('commercial:edit');
    const group = form.dataset.group as CategoryGroup;
    const label = values.text('label');
    if (!label) return;
    await store().apply((draft) => addCategory(draft, group, label, (values.text('tone') || 'neutral') as Tone));
    toast(`"${label}" adicionada.`);
    document.getElementById('category-new')?.focus();
  },
});

registerActions({
  'categories:group': (el) => {
    ui.group = el.dataset.value as CategoryGroup;
    window.location.hash = categoriesHref(ui.group);
  },
  'category:rename': async (el) => {
    requirePermission('commercial:edit');
    const input = el as HTMLInputElement;
    const group = input.dataset.group as CategoryGroup;
    const item = categories(store().data, group, true).find((c) => c.id === input.dataset.id);
    if (!item || item.label === input.value.trim()) return;
    try {
      await store().apply((draft) => renameCategory(draft, group, input.dataset.id!, input.value));
      toast('Categoria renomeada. Os registros que usavam o nome antigo foram atualizados.');
    } catch (error) {
      input.value = item.label;
      throw error;
    }
  },
  'category:tone': async (el) => {
    requirePermission('commercial:edit');
    await store().apply((draft) => setCategoryTone(draft, el.dataset.group as CategoryGroup, el.dataset.id!, (el as HTMLSelectElement).value as Tone));
  },
  'category:archive': async (el) => {
    requirePermission('commercial:edit');
    await store().apply((draft) => toggleCategoryArchived(draft, el.dataset.group as CategoryGroup, el.dataset.id!));
    rerender();
  },
  'category:up': async (el) => {
    requirePermission('commercial:edit');
    await store().apply((draft) => moveCategory(draft, el.dataset.group as CategoryGroup, el.dataset.id!, -1));
  },
  'category:down': async (el) => {
    requirePermission('commercial:edit');
    await store().apply((draft) => moveCategory(draft, el.dataset.group as CategoryGroup, el.dataset.id!, 1));
  },
});

function renderGroup(group: CategoryGroup): SafeHtml {
  const { data } = store();
  const info = CATEGORY_GROUPS.find((g) => g.value === group)!;
  const list = categories(data, group, true);
  const edit = allowed('commercial:edit');
  return html`
    <section class="panel">
      <header class="panel__header">
        <h2 class="panel__title">${info.label}</h2>
        <span class="muted small">Usado em: ${info.usedIn}</span>
      </header>
      <div class="panel__body">
        <p class="muted small">${info.description}</p>
        <ol class="category-list">
          ${list.map((c) => {
            const used = categoryUsage(data, group, c);
            return html`<li class="${cx('category-row', c.archived && 'is-archived')}">
              <span class="${cx('stage-editor__dot', `tone--${c.tone}`)}" aria-hidden="true"></span>
              <label class="visually-hidden" for="cat-${c.id}">Nome</label>
              <input id="cat-${c.id}" class="input" value="${c.label}" maxlength="40" data-change="category:rename" data-group="${group}" data-id="${c.id}" ${edit ? '' : 'disabled'} />
              <select class="input select" aria-label="Cor de ${c.label}" data-change="category:tone" data-group="${group}" data-id="${c.id}" ${edit ? '' : 'disabled'}>
                ${TONES.map((t) => html`<option value="${t.value}" ${t.value === c.tone ? 'selected' : ''}>${t.label}</option>`)}
              </select>
              <span class="category-row__usage">${used ? `${used} ${used === 1 ? 'uso' : 'usos'}` : 'sem uso'}</span>
              <span class="stage-editor__actions">
                ${edit
                  ? html`${button({ label: `Subir ${c.label}`, iconOnly: true, icon: 'arrowUp', variant: 'ghost', size: 'sm', action: 'category:up', data: { group, id: c.id } })}
                    ${button({ label: `Descer ${c.label}`, iconOnly: true, icon: 'arrowDown', variant: 'ghost', size: 'sm', action: 'category:down', data: { group, id: c.id } })}
                    ${button({ label: c.archived ? 'Reativar' : 'Arquivar', size: 'sm', variant: 'ghost', action: 'category:archive', data: { group, id: c.id } })}`
                  : ''}
              </span>
              ${c.archived ? html`<span class="category-row__tag">${badge('Arquivada', 'neutral')}</span>` : ''}
            </li>`;
          })}
        </ol>
        ${edit
          ? html`<form class="inline-form" data-form="category:add" data-group="${group}">
              <label class="visually-hidden" for="category-new">Nova categoria</label>
              <input id="category-new" class="input" name="label" placeholder="Nome da nova categoria" autocomplete="off" maxlength="40" />
              <select class="input select select--inline" name="tone" aria-label="Cor">
                ${TONES.map((t) => html`<option value="${t.value}">${t.label}</option>`)}
              </select>
              <button class="btn btn--secondary" type="submit">${icon('plus', 16)}<span>Adicionar</span></button>
            </form>
            <p class="muted small">${icon('info', 13)} Para renomear, edite o texto e clique fora. Arquivar tira a categoria das opções, mas o que já foi registrado com ela continua igual.</p>`
          : ''}
      </div>
    </section>`;
}

export const categoriesView: View = {
  title: () => 'Categorias',
  render: (route) => {
    const fromRoute = route.params[0] as CategoryGroup | undefined;
    if (fromRoute && CATEGORY_GROUPS.some((g) => g.value === fromRoute)) ui.group = fromRoute;
    const { data } = store();
    return html`
      ${pageHeader({ title: 'Categorias', subtitle: 'As listas do sistema são de vocês: criem, renomeiem e arquivem quando quiserem.' })}
      <div class="toolbar">
        ${segmented({
          label: 'Lista',
          action: 'categories:group',
          value: ui.group,
          items: CATEGORY_GROUPS.map((g) => ({ value: g.value, label: g.label.replace('Categorias de ', '').replace(/^./, (x) => x.toUpperCase()), count: categories(data, g.value).length })),
        })}
      </div>
      ${renderGroup(ui.group)}
    `;
  },
};
