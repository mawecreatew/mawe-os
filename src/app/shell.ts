/**
 * Estrutura fixa da aplicação: menu lateral da Central, perfil ativo e aviso
 * de protótipo.
 *
 * Menu: dois botões no topo (Novo lead e Adicionar), o acesso rápido do dia a
 * dia e as áreas em grupos que abrem e fecham (Comercial, Operações,
 * Marketing, Administrativo e Agência).
 */
import { registerActions } from '../core/events.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import type { Route } from '../core/router.ts';
import { BRAND } from '../config/brand.ts';
import { callTodayCount } from '../domain/cadence.ts';
import { contractsEndingSoon, inOnboarding } from '../domain/clientcare.ts';
import { upcomingBills } from '../domain/finance.ts';
import { overdueTasks } from '../domain/selectors.ts';
import { teamMembers } from '../domain/people.ts';
import { unreadChat } from '../domain/workspace.ts';
import { avatar } from '../ui/components.ts';
import { icon, type IconName } from '../ui/icons.ts';
import { openModal } from '../ui/overlay.ts';
import '../ui/search.ts';
import { allowed, auth, brandAssets, rerender, store, today } from './context.ts';

interface NavLink {
  href: string;
  label: string;
  icon: IconName;
  /** A rota atual pertence a este item? */
  match: (route: Route) => boolean;
  count?: () => number;
  countTone?: 'alert' | 'muted';
  /** Só aparece para quem pode ver dados financeiros. */
  finance?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  icon: IconName;
  items: NavLink[];
}

const at = (section: string, first?: string) => (route: Route) => route.section === section && (first === undefined || route.params[0] === first);
const atSection = (...sections: string[]) => (route: Route) => sections.includes(route.section);

const QUICK: NavLink[] = [
  { href: '#/painel', label: 'Início', icon: 'home', match: atSection('painel') },
  { href: '#/planejamento', label: 'Planejamento da agência', icon: 'target', match: atSection('planejamento') },
  { href: '#/notas', label: 'Bloco de notas', icon: 'edit', match: atSection('notas') },
  { href: '#/tarefas', label: 'Tarefas', icon: 'tasks', match: atSection('tarefas'), count: () => overdueTasks(store().data, today()).length, countTone: 'alert' },
  { href: '#/chat', label: 'Chat da equipe', icon: 'chat', match: atSection('chat'), count: () => unreadChat(store().data, store().currentUser.id), countTone: 'alert' },
];

const GROUPS: NavGroup[] = [
  {
    id: 'comercial',
    label: 'Comercial',
    icon: 'commercial',
    items: [
      {
        href: '#/comercial',
        label: 'Prospecção',
        icon: 'target',
        match: (r) => r.section === 'comercial' && r.params[0] !== 'propostas' && r.params[0] !== 'relatorios',
        count: () => callTodayCount(store().data, today()),
        countTone: 'alert',
      },
      { href: '#/comercial/propostas', label: 'Propostas e contratos', icon: 'file', match: at('comercial', 'propostas') },
      { href: '#/biblioteca', label: 'Mensagens prontas', icon: 'message', match: atSection('biblioteca') },
      { href: '#/comercial/relatorios', label: 'Relatórios', icon: 'chart', match: at('comercial', 'relatorios') },
    ],
  },
  {
    id: 'operacoes',
    label: 'Operações',
    icon: 'projects',
    items: [
      { href: '#/clientes', label: 'Clientes (A a Z)', icon: 'clients', match: atSection('clientes') },
      { href: '#/projetos', label: 'Projetos', icon: 'kanban', match: atSection('projetos') },
      { href: '#/aprovacoes', label: 'Aprovações', icon: 'check', match: atSection('aprovacoes') },
      { href: '#/onboarding', label: 'Onboarding', icon: 'flag', match: atSection('onboarding'), count: () => store().data.clients.filter((c) => inOnboarding(store().data, c)).length, countTone: 'muted' },
      { href: '#/contratos', label: 'Contratos e vencimentos', icon: 'repeat', match: atSection('contratos'), count: () => contractsEndingSoon(store().data, today()).length, countTone: 'alert' },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: 'megaphone',
    items: [
      { href: '#/marketing', label: 'Instagram da Mawe', icon: 'image', match: atSection('marketing') },
      { href: '#/calendario', label: 'Calendário de conteúdo', icon: 'calendar', match: atSection('calendario') },
      { href: '#/trafego', label: 'Tráfego pago', icon: 'megaphone', match: atSection('trafego') },
    ],
  },
  {
    id: 'administrativo',
    label: 'Administrativo',
    icon: 'layers',
    items: [
      { href: '#/administrativo', label: 'Visão geral', icon: 'layers', match: atSection('administrativo') },
      { href: '#/financeiro', label: 'Financeiro', icon: 'wallet', finance: true, match: atSection('financeiro'), count: () => upcomingBills(store().data, today(), 0).length, countTone: 'alert' },
      { href: '#/relatorio', label: 'Relatório do mês', icon: 'chart', match: atSection('relatorio') },
      { href: '#/servicos', label: 'Serviços e preços', icon: 'tag', match: atSection('servicos') },
      { href: '#/equipe', label: 'Equipe', icon: 'user', match: atSection('equipe') },
      { href: '#/categorias', label: 'Categorias', icon: 'tag', match: atSection('categorias') },
      { href: '#/sistema', label: 'Sistema', icon: 'settings', match: atSection('sistema') },
    ],
  },
  {
    id: 'agencia',
    label: 'Agência',
    icon: 'route',
    items: [
      { href: '#/processos', label: 'Processos', icon: 'route', match: atSection('processos') },
      { href: '#/treinamento', label: 'Treinamento', icon: 'check', match: atSection('treinamento') },
      { href: '#/kit', label: 'Kit da agência', icon: 'folder', match: atSection('kit') },
    ],
  },
];

// ---------------------------------------------------------------- Grupos abertos

const OPEN_KEY = 'mawe-os:menu-aberto';
let openGroups: Set<string> | null = null;

function loadOpenGroups(): Set<string> {
  if (openGroups) return openGroups;
  try {
    const saved = JSON.parse(window.localStorage.getItem(OPEN_KEY) ?? 'null');
    openGroups = new Set(Array.isArray(saved) ? saved.filter((x) => typeof x === 'string') : ['comercial', 'operacoes']);
  } catch {
    openGroups = new Set(['comercial', 'operacoes']);
  }
  return openGroups;
}

function saveOpenGroups(): void {
  try {
    window.localStorage.setItem(OPEN_KEY, JSON.stringify([...loadOpenGroups()]));
  } catch {
    /* sem armazenamento: vale até recarregar */
  }
}

function visible(item: NavLink): boolean {
  return !item.finance || allowed('finance:view');
}

function countBadge(item: NavLink): SafeHtml {
  const count = item.count?.() ?? 0;
  if (count <= 0) return html``;
  return html`<span class="${cx('nav__count', item.countTone === 'alert' && 'nav__count--alert')}" title="Itens que precisam de atenção">${count}</span>`;
}

function navLink(item: NavLink, route: Route, sub = false): SafeHtml {
  const active = item.match(route);
  return html`<a class="${cx('nav__item', sub && 'nav__item--sub', active && 'is-active')}" href="${item.href}" ${active ? html`aria-current="page"` : ''} data-action="nav:close">
    ${icon(item.icon, sub ? 16 : 18)}
    <span class="nav__label">${item.label}</span>
    ${countBadge(item)}
  </a>`;
}

function navGroup(group: NavGroup, route: Route): SafeHtml {
  const items = group.items.filter(visible);
  const hasActive = items.some((i) => i.match(route));
  const open = hasActive || loadOpenGroups().has(group.id);
  const alerts = items.filter((i) => i.countTone === 'alert').reduce((s, i) => s + (i.count?.() ?? 0), 0);
  return html`<div class="${cx('nav-group', open && 'is-open', hasActive && 'has-active')}">
    <button type="button" class="nav__item nav-group__toggle" data-action="nav:group" data-id="${group.id}" aria-expanded="${open ? 'true' : 'false'}" aria-controls="nav-${group.id}">
      ${icon(group.icon, 18)}
      <span class="nav__label">${group.label}</span>
      ${!open && alerts ? html`<span class="nav__count nav__count--alert">${alerts}</span>` : ''}
      <span class="nav-group__chevron" aria-hidden="true">${icon('chevronRight', 14)}</span>
    </button>
    <div class="nav-group__items" id="nav-${group.id}" ${open ? '' : 'hidden'}>${items.map((i) => navLink(i, route, true))}</div>
  </div>`;
}

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
      <p class="profile__note">${icon('lock', 13)} Sem autenticação: troca apenas para visualização.</p>
    </div>`;
}

export function renderSidebar(route: Route): SafeHtml {
  return html`
    <div class="sidebar__brand">
      <a class="brand" href="#/painel" aria-label="${BRAND.agencyName} ${BRAND.productName}, início">
        ${brandBlock()}
        <span class="brand__product">${BRAND.productName}</span>
      </a>
      <button type="button" class="sidebar__close btn btn--ghost btn--icon" data-action="nav:close" aria-label="Fechar menu">${icon('close')}</button>
    </div>

    <div class="sidebar__actions">
      <button type="button" class="btn btn--primary btn--block" data-action="opportunity:new">${icon('plus', 16)}<span>Novo lead</span></button>
      <button type="button" class="btn btn--outline-menu btn--block" data-action="quick:add">${icon('plus', 16)}<span>Adicionar</span></button>
    </div>

    <button type="button" class="nav-search" data-action="search:open">
      ${icon('search', 16)}<span>Buscar</span><kbd>Ctrl K</kbd>
    </button>

    <nav class="nav" aria-label="Navegação principal">
      <span class="nav__group">Acesso rápido</span>
      ${QUICK.map((item) => navLink(item, route))}
      <span class="nav__group">Áreas</span>
      ${GROUPS.map((g) => navGroup(g, route))}
    </nav>

    <div class="sidebar__footer">
      <button type="button" class="nav__item nav__item--button" data-action="theme:open">
        ${icon('image', 18)}<span class="nav__label">Cores do sistema</span><span class="theme-dot" aria-hidden="true"></span>
      </button>
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

// ---------------------------------------------------------------- Adicionar

const QUICK_ADD: Array<{ action: string; label: string; hint: string; icon: IconName; finance?: boolean }> = [
  { action: 'task:new', label: 'Tarefa', hint: 'Algo para fazer, com prazo e responsável', icon: 'tasks' },
  { action: 'client:new', label: 'Cliente', hint: 'Quem já fechou com vocês', icon: 'clients' },
  { action: 'finance:new-in', label: 'Entrada de dinheiro', hint: 'Pagamento recebido ou a receber', icon: 'money', finance: true },
  { action: 'approval:new', label: 'Aprovação', hint: 'O que o cliente aprovou, com o print', icon: 'check' },
  { action: 'contract:new', label: 'Contrato', hint: 'Site, manutenção ou domínio com vencimento', icon: 'repeat' },
  { action: 'note:new', label: 'Nota', hint: 'Anotação rápida no bloco de notas', icon: 'edit' },
  { action: 'post-idea:new', label: 'Ideia de post', hint: 'Para o Instagram da Mawe', icon: 'image' },
];

registerActions({
  'auth:logout': async () => {
    const session = auth();
    if (session.mode === 'supabase') await session.client.signOut();
    window.location.reload();
  },
  'profile:switch': (el) => store().setCurrentUser(el.dataset.id!),
  'nav:open': () => document.body.classList.add('nav-open'),
  'nav:close': () => document.body.classList.remove('nav-open'),
  'nav:group': (el) => {
    const groups = loadOpenGroups();
    const id = el.dataset.id!;
    if (el.getAttribute('aria-expanded') === 'true') groups.delete(id);
    else groups.add(id);
    saveOpenGroups();
    rerender();
  },
  'quick:add': () => {
    document.body.classList.remove('nav-open');
    openModal({
      title: 'Adicionar',
      description: 'O que você quer registrar?',
      body: html`<div class="quick-add">
        ${QUICK_ADD.filter((q) => !q.finance || allowed('finance:edit')).map(
          (q) => html`<button type="button" class="quick-add__item" data-action="${q.action}">
            <span class="quick-add__icon">${icon(q.icon, 18)}</span>
            <span><strong>${q.label}</strong><small>${q.hint}</small></span>
          </button>`,
        )}
      </div>`,
    });
  },
});
