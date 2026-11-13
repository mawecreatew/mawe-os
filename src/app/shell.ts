/** Estrutura fixa da aplicação: menu lateral, perfil ativo e aviso de protótipo. */
import { registerActions } from '../core/events.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { BRAND } from '../config/brand.ts';
import { upcomingBills } from '../domain/finance.ts';
import { overdueTasks, pipelineSummary } from '../domain/selectors.ts';
import { teamMembers } from '../domain/people.ts';
import { avatar } from '../ui/components.ts';
import { icon, type IconName } from '../ui/icons.ts';
import '../ui/search.ts';
import { allowed, auth, brandAssets, store, today } from './context.ts';

interface NavItem {
  section: string;
  label: string;
  icon: IconName;
  count?: () => number;
  countTone?: 'alert' | 'muted';
  /** Só aparece para quem pode ver dados financeiros. */
  finance?: boolean;
  /** Grupo do menu (o título aparece acima do primeiro item do grupo). */
  group: string;
}

/** Menu organizado pelo caminho do dinheiro: vender → entregar → gerir. */
const NAV: NavItem[] = [
  { group: '', section: 'painel', label: 'Painel', icon: 'home' },
  {
    group: 'Vender',
    section: 'comercial',
    label: 'Comercial',
    icon: 'commercial',
    count: () => pipelineSummary(store().data, today()).followUpsDue,
    countTone: 'alert',
  },
  { group: 'Vender', section: 'clientes', label: 'Clientes', icon: 'clients' },
  { group: 'Entregar', section: 'projetos', label: 'Projetos', icon: 'projects' },
  {
    group: 'Entregar',
    section: 'tarefas',
    label: 'Tarefas',
    icon: 'tasks',
    count: () => overdueTasks(store().data, today()).length,
    countTone: 'alert',
  },
  { group: 'Entregar', section: 'calendario', label: 'Calendário de conteúdo', icon: 'calendar' },
  {
    group: 'Gestão',
    section: 'financeiro',
    label: 'Financeiro',
    icon: 'wallet',
    finance: true,
    count: () => upcomingBills(store().data, today(), 0).length,
    countTone: 'alert',
  },
  { group: 'Gestão', section: 'trafego', label: 'Tráfego pago', icon: 'megaphone' },
  { group: 'Gestão', section: 'servicos', label: 'Serviços e preços', icon: 'tag' },
  { group: 'Recursos', section: 'biblioteca', label: 'Biblioteca', icon: 'library' },
  { group: 'Recursos', section: 'agentes', label: 'Central de agentes', icon: 'agents' },
];

function brandBlock(): SafeHtml {
  if (brandAssets.logoHorizontal) {
    return html`<img class="brand__logo" src="${brandAssets.logoHorizontal}" alt="${BRAND.agencyName}" />`;
  }
  // Sem arquivo de logo: mostra apenas o nome, em texto. Não é uma logo.
  return html`<span class="brand__name" title="Logo oficial ainda não adicionada (veja public/brand/LEIA-ME.md)">${BRAND.agencyName}</span>`;
}

function renderProfile(): SafeHtml {
  const { data, currentUser } = store();
  const session = auth();
  if (session.mode === 'supabase') {
    return html`
      <div class="profile">
        <span class="profile__label">Conectado como</span>
        <div class="profile__account">
          ${avatar(currentUser, 'md')}
          <div class="profile__who"><strong>${currentUser.name}</strong><small>${session.email}</small></div>
        </div>
        <button type="button" class="btn btn--ghost btn--sm profile__logout" data-action="auth:logout">${icon('arrowLeft', 14)}<span>Sair</span></button>
      </div>`;
  }
  return html`
    <div class="profile">
      <span class="profile__label">Perfil ativo</span>
      <div class="profile__switch" role="group" aria-label="Trocar perfil ativo">
        ${teamMembers(data).map(
          (u) => html`<button type="button" class="${cx('profile__option', u.id === currentUser.id && 'is-active')}"
            data-action="profile:switch" data-id="${u.id}" aria-pressed="${u.id === currentUser.id ? 'true' : 'false'}">
            ${avatar(u)}<span>${u.shortName}</span></button>`,
        )}
      </div>
      <p class="profile__note">${icon('lock', 13)} Sem autenticação — troca apenas para visualização.</p>
    </div>`;
}

export function renderSidebar(activeSection: string): SafeHtml {
  return html`
    <div class="sidebar__brand">
      <a class="brand" href="#/painel" aria-label="${BRAND.productName} — Painel">
        ${brandBlock()}
        <span class="brand__product">${BRAND.productName}</span>
      </a>
      <button type="button" class="sidebar__close btn btn--ghost btn--icon" data-action="nav:close" aria-label="Fechar menu">${icon('close')}</button>
    </div>

    <button type="button" class="nav-search" data-action="search:open">
      ${icon('search', 16)}<span>Buscar</span><kbd>Ctrl K</kbd>
    </button>

    <nav class="nav" aria-label="Navegação principal">
      ${NAV.filter((item) => !item.finance || allowed('finance:view')).map((item, i, list) => {
        const count = item.count?.() ?? 0;
        const active = item.section === activeSection;
        const groupTitle = item.group && item.group !== list[i - 1]?.group ? html`<span class="nav__group">${item.group}</span>` : '';
        return html`${groupTitle}
          <a class="${cx('nav__item', active && 'is-active')}" href="#/${item.section}" ${active ? html`aria-current="page"` : ''} data-action="nav:close">
            ${icon(item.icon, 18)}
            <span class="nav__label">${item.label}</span>
            ${count > 0 ? html`<span class="${cx('nav__count', item.countTone === 'alert' && 'nav__count--alert')}" title="Itens que precisam de atenção">${count}</span>` : ''}
          </a>`;
      })}
    </nav>

    <div class="sidebar__footer">
      <a class="${cx('nav__item', activeSection === 'equipe' && 'is-active')}" href="#/equipe" data-action="nav:close">
        ${icon('user', 18)}<span class="nav__label">Equipe</span>
      </a>
      <a class="${cx('nav__item', activeSection === 'categorias' && 'is-active')}" href="#/categorias" data-action="nav:close">
        ${icon('tag', 18)}<span class="nav__label">Categorias</span>
      </a>
      <a class="${cx('nav__item', activeSection === 'sistema' && 'is-active')}" href="#/sistema" data-action="nav:close">
        ${icon('settings', 18)}<span class="nav__label">Sistema</span>
      </a>
      ${renderProfile()}
    </div>
  `;
}

export function renderPrototypeBanner(): SafeHtml {
  const dataset = store().data.meta.dataset;
  if (auth().mode === 'supabase') {
    return html`
      <div class="env-banner env-banner--connected" role="note">
        <span class="env-banner__dot" aria-hidden="true"></span>
        <strong>Conectado</strong>
        <span class="env-banner__sep" aria-hidden="true">·</span>
        <span>Dados compartilhados entre os sócios (Supabase)</span>
        <a class="env-banner__link" href="#/sistema">Detalhes</a>
      </div>
    `;
  }
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
  'auth:logout': async () => {
    const session = auth();
    if (session.mode === 'supabase') await session.client.signOut();
    window.location.reload();
  },
  'profile:switch': (el) => store().setCurrentUser(el.dataset.id!),
  'nav:open': () => document.body.classList.add('nav-open'),
  'nav:close': () => document.body.classList.remove('nav-open'),
});
