/** Estrutura fixa da aplicação: menu lateral, perfil ativo e aviso de protótipo. */
import { registerActions } from '../core/events.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { BRAND } from '../config/brand.ts';
import { overdueTasks, pipelineSummary } from '../domain/selectors.ts';
import { avatar } from '../ui/components.ts';
import { icon, type IconName } from '../ui/icons.ts';
import { brandAssets, store, today } from './context.ts';

interface NavItem {
  section: string;
  label: string;
  icon: IconName;
  count?: () => number;
  countTone?: 'alert' | 'muted';
}

const NAV: NavItem[] = [
  { section: 'painel', label: 'Painel', icon: 'home' },
  {
    section: 'comercial',
    label: 'Comercial',
    icon: 'commercial',
    count: () => pipelineSummary(store().data, today()).followUpsDue,
    countTone: 'alert',
  },
  { section: 'clientes', label: 'Clientes', icon: 'clients' },
  { section: 'projetos', label: 'Projetos', icon: 'projects' },
  {
    section: 'tarefas',
    label: 'Tarefas',
    icon: 'tasks',
    count: () => overdueTasks(store().data, today()).length,
    countTone: 'alert',
  },
  { section: 'biblioteca', label: 'Biblioteca', icon: 'library' },
  { section: 'agentes', label: 'Central de agentes', icon: 'agents' },
];

function brandBlock(): SafeHtml {
  if (brandAssets.logoHorizontal) {
    return html`<img class="brand__logo" src="${brandAssets.logoHorizontal}" alt="${BRAND.agencyName}" />`;
  }
  // Sem arquivo de logo: mostra apenas o nome, em texto. Não é uma logo.
  return html`<span class="brand__name" title="Logo oficial ainda não adicionada (veja public/brand/LEIA-ME.md)">${BRAND.agencyName}</span>`;
}

export function renderSidebar(activeSection: string): SafeHtml {
  const { data, currentUser } = store();
  return html`
    <div class="sidebar__brand">
      <a class="brand" href="#/painel" aria-label="${BRAND.productName} — Painel">
        ${brandBlock()}
        <span class="brand__product">${BRAND.productName}</span>
      </a>
      <button type="button" class="sidebar__close btn btn--ghost btn--icon" data-action="nav:close" aria-label="Fechar menu">${icon('close')}</button>
    </div>

    <nav class="nav" aria-label="Navegação principal">
      ${NAV.map((item) => {
        const count = item.count?.() ?? 0;
        const active = item.section === activeSection;
        return html`
          <a class="${cx('nav__item', active && 'is-active')}" href="#/${item.section}" ${active ? html`aria-current="page"` : ''} data-action="nav:close">
            ${icon(item.icon, 18)}
            <span class="nav__label">${item.label}</span>
            ${count > 0 ? html`<span class="${cx('nav__count', item.countTone === 'alert' && 'nav__count--alert')}" title="Itens que precisam de atenção">${count}</span>` : ''}
          </a>`;
      })}
    </nav>

    <div class="sidebar__footer">
      <a class="${cx('nav__item', activeSection === 'sistema' && 'is-active')}" href="#/sistema" data-action="nav:close">
        ${icon('settings', 18)}<span class="nav__label">Sistema</span>
      </a>
      <div class="profile">
        <span class="profile__label">Perfil ativo</span>
        <div class="profile__switch" role="group" aria-label="Trocar perfil ativo">
          ${data.users.map(
            (u) => html`<button type="button" class="${cx('profile__option', u.id === currentUser.id && 'is-active')}"
              data-action="profile:switch" data-id="${u.id}" aria-pressed="${u.id === currentUser.id ? 'true' : 'false'}">
              ${avatar(u)}<span>${u.shortName}</span></button>`,
          )}
        </div>
        <p class="profile__note">${icon('lock', 13)} Sem autenticação — troca apenas para visualização.</p>
      </div>
    </div>
  `;
}

export function renderPrototypeBanner(): SafeHtml {
  const dataset = store().data.meta.dataset;
  return html`
    <div class="env-banner" role="note">
      <span class="env-banner__dot" aria-hidden="true"></span>
      <strong>Protótipo local</strong>
      <span class="env-banner__sep" aria-hidden="true">·</span>
      <span>${dataset === 'demo' ? 'Dados de demonstração (fictícios)' : 'Base local, salva somente neste navegador'}</span>
      <span class="env-banner__sep env-banner__hide-sm" aria-hidden="true">·</span>
      <span class="env-banner__hide-sm">Sem login nem integrações externas</span>
      <a class="env-banner__link" href="#/sistema">Detalhes</a>
    </div>
  `;
}

registerActions({
  'profile:switch': (el) => store().setCurrentUser(el.dataset.id!),
  'nav:open': () => document.body.classList.add('nav-open'),
  'nav:close': () => document.body.classList.remove('nav-open'),
});
