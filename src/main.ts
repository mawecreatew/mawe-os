/**
 * Ponto de entrada do Mawe OS.
 * Abre os dados, liga a navegação e desenha a tela atual sempre que algo muda.
 */
import { installEventDelegation, onActionError } from './core/events.ts';
import { html } from './core/html.ts';
import { currentRoute } from './core/router.ts';
import { LocalStorageDataSource, MemoryDataSource, type DataSource } from './data/source.ts';
import { Store, type StoreOptions } from './data/store.ts';
import { loadBrandAssets } from './app/brand-loader.ts';
import { setAuth, setRenderer, setStore } from './app/context.ts';
import { showBlockingMessage, showLogin } from './app/login.ts';
import { AuthRequiredError, SupabaseClient } from './integrations/supabase/client.ts';
import { loadSupabaseConfig } from './integrations/supabase/config.ts';
import { SupabaseDataSource } from './integrations/supabase/data-source.ts';
import { renderBell, renderPrototypeBanner, renderSidebar } from './app/shell.ts';
import type { View } from './app/view.ts';
import { emptyState, pageHeader } from './ui/components.ts';
import { toast } from './ui/overlay.ts';
import { agentsView } from './views/agents.ts';
import { calendarView } from './views/calendar.ts';
import { financeView } from './views/finance.ts';
import { servicesView } from './views/services.ts';
import { trafficView } from './views/traffic.ts';
import { clientsView } from './views/clients.ts';
import { commercialView } from './views/commercial.ts';
import { dashboardView } from './views/dashboard.ts';
import { libraryView } from './views/library.ts';
import { projectsView } from './views/projects.ts';
import { systemView } from './views/system.ts';
import { tasksView } from './views/tasks.ts';
import { categoriesView } from './views/categories.ts';
import { teamView } from './views/team.ts';
import { approvalsView } from './views/approvals.ts';
import { processesView } from './views/processes.ts';
import { installProofLoader, setProofLookup } from './app/proofs.ts';
import { applySavedTheme } from './app/theme.ts';
import { findClientFile } from './domain/clientcare.ts';
import { findContentFile } from './domain/contentbank.ts';
import { adminView } from './views/admin.ts';
import { chatView } from './views/chat.ts';
import { contractsView } from './views/contracts.ts';
import { kitView } from './views/kit.ts';
import { marketingView } from './views/marketing.ts';
import { notesView } from './views/notes.ts';
import { notificationsView } from './views/notifications.ts';
import { contentBankView } from './views/contentbank.ts';
import { learningsView } from './views/learnings.ts';
import { onboardingView } from './views/onboarding.ts';
import { planningView } from './views/planning.ts';
import { reportView } from './views/report.ts';
import { sitesView } from './views/site-report.ts';
import { trainingView } from './views/training.ts';

const ROUTES: Record<string, View> = {
  painel: dashboardView,
  comercial: commercialView,
  clientes: clientsView,
  projetos: projectsView,
  calendario: calendarView,
  tarefas: tasksView,
  financeiro: financeView,
  trafego: trafficView,
  servicos: servicesView,
  biblioteca: libraryView,
  agentes: agentsView,
  sistema: systemView,
  categorias: categoriesView,
  equipe: teamView,
  processos: processesView,
  aprovacoes: approvalsView,
  planejamento: planningView,
  notas: notesView,
  chat: chatView,
  onboarding: onboardingView,
  contratos: contractsView,
  marketing: marketingView,
  administrativo: adminView,
  relatorio: reportView,
  treinamento: trainingView,
  kit: kitView,
  sites: sitesView,
  avisos: notificationsView,
  conteudo: contentBankView,
  aprendizados: learningsView,
};

const notFoundView: View = {
  title: () => 'Página não encontrada',
  render: () => html`${pageHeader({ title: 'Página não encontrada' })}
    <div class="panel">${emptyState({ icon: 'info', title: 'Este endereço não existe.', action: html`<a class="btn btn--primary" href="#/painel">Voltar ao painel</a>` })}</div>`,
};

const STORAGE_KEY = 'mawe-os:dados:v1';

function localDataSource(): DataSource {
  try {
    const probe = '__mawe_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return new LocalStorageDataSource(STORAGE_KEY);
  } catch {
    return new MemoryDataSource();
  }
}

function el(id: string): HTMLElement {
  const found = document.getElementById(id);
  if (!found) throw new Error(`Elemento #${id} não encontrado no index.html`);
  return found;
}

/** Desenha a tela preservando foco, posição do cursor e rolagem horizontal do funil. */
function render(): void {
  const route = currentRoute();
  const view = ROUTES[route.section] ?? notFoundView;

  const active = document.activeElement as HTMLInputElement | null;
  const focusId = active?.id || null;
  const selection = focusId && typeof active?.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  const scrolls = new Map<string, number>();
  document.querySelectorAll<HTMLElement>('[data-preserve-scroll]').forEach((node) => scrolls.set(node.dataset.preserveScroll!, node.scrollLeft));

  el('sidebar').innerHTML = renderSidebar(route).value;
  el('banner').innerHTML = renderPrototypeBanner().value;
  el('topbar-bell').innerHTML = renderBell().value;
  try {
    el('view').innerHTML = view.render(route).value;
    document.title = `${view.title(route)} · Central MaweCreate`;
  } catch (error) {
    console.error(error);
    el('view').innerHTML = html`<div class="panel">${emptyState({ icon: 'alert', title: 'Não foi possível exibir esta tela.', text: error instanceof Error ? error.message : String(error) })}</div>`.value;
  }

  document.querySelectorAll<HTMLElement>('[data-preserve-scroll]').forEach((node) => {
    const left = scrolls.get(node.dataset.preserveScroll!);
    if (left) node.scrollLeft = left;
  });
  if (focusId) {
    const target = document.getElementById(focusId) as HTMLInputElement | null;
    if (target && target !== document.activeElement) {
      target.focus();
      if (selection && typeof target.setSelectionRange === 'function') {
        try {
          target.setSelectionRange(selection[0], selection[1]);
        } catch {
          /* alguns tipos de campo não aceitam seleção */
        }
      }
    }
  }
}

/** Intervalo para buscar alterações feitas pelo outro sócio (no chat é mais rápido). */
const SYNC_INTERVAL_MS = 20_000;
const CHAT_SYNC_INTERVAL_MS = 5_000;

function startSync(store: Store): void {
  let last = 0;
  const sync = (force = false) => {
    const onChat = currentRoute().section === 'chat';
    const now = Date.now();
    if (!force && now - last < (onChat ? CHAT_SYNC_INTERVAL_MS : SYNC_INTERVAL_MS) - 500) return;
    // No chat, digitar no campo de mensagem não impede de receber as novas.
    const active = document.activeElement as HTMLElement | null;
    const typing = active?.matches('input, textarea, select') && !(onChat && active.id === 'chat-text');
    const busy = document.querySelector('dialog[open]') || typing;
    if (document.visibilityState !== 'visible' || busy) return;
    last = now;
    store.sync().catch((error) => {
      if (error instanceof AuthRequiredError) window.location.reload();
    });
  };
  setInterval(() => sync(), CHAT_SYNC_INTERVAL_MS);
  window.addEventListener('focus', () => sync(true));
}

/**
 * Decide como o sistema abre:
 * - sem public/config.json → protótipo local (como antes);
 * - com config → exige login no Supabase e usa os dados compartilhados.
 * Retorna null quando uma tela de login ou aviso foi exibida no lugar do sistema.
 */
async function prepareAccess(): Promise<StoreOptions | null> {
  let config;
  try {
    config = await loadSupabaseConfig();
  } catch (error) {
    showBlockingMessage({ title: 'Configuração incompleta', text: error instanceof Error ? error.message : String(error), canRetry: true });
    return null;
  }
  if (!config) return { source: localDataSource(), profileStorage: window.localStorage };

  const client = new SupabaseClient(config, { storage: window.localStorage });
  try {
    const session = await client.restoreSession();
    if (!session) {
      showLogin(client);
      return null;
    }
    setAuth({ mode: 'supabase', client, email: session.user.email });
    const member = await client.fetchMember();
    if (!member) {
      showBlockingMessage({
        title: 'Conta sem acesso',
        text: `A conta ${session.user.email} entrou, mas não está cadastrada como membro do Mawe OS. Peça para incluí-la na tabela "members" do Supabase (veja docs/SUPABASE.md).`,
        canSignOut: true,
      });
      return null;
    }
    return { source: new SupabaseDataSource(client), initialDataset: 'empty', lockedUserId: member.appUserId };
  } catch (error) {
    if (error instanceof AuthRequiredError) {
      showLogin(client, { text: error.message, tone: 'info' });
    } else {
      showBlockingMessage({ title: 'Não foi possível abrir o Mawe OS', text: error instanceof Error ? error.message : String(error), canRetry: true, canSignOut: true });
    }
    return null;
  }
}

async function start(): Promise<void> {
  applySavedTheme();
  installEventDelegation();
  onActionError((error) => {
    // A mensagem já aparece na tela; no console fica só como aviso (ex.: validação de formulário).
    console.warn(error);
    if (error instanceof AuthRequiredError) {
      window.location.reload();
      return;
    }
    toast(error instanceof Error ? error.message : 'Algo deu errado.', 'error');
  });

  await loadBrandAssets();
  const access = await prepareAccess();
  if (!access) return;

  let store: Store;
  try {
    store = await Store.open(access);
  } catch (error) {
    if (error instanceof AuthRequiredError) return window.location.reload();
    showBlockingMessage({ title: 'Não foi possível carregar os dados', text: error instanceof Error ? error.message : String(error), canRetry: true, canSignOut: Boolean(access.lockedUserId) });
    return;
  }
  setStore(store);
  setProofLookup((id) => (store.data.approvals ?? []).find((a) => a.id === id)?.proof ?? findClientFile(store.data, id) ?? findContentFile(store.data, id) ?? undefined);
  installProofLoader();
  if (access.lockedUserId) startSync(store);

  setRenderer(render);
  store.subscribe(render);
  window.addEventListener('hashchange', () => {
    render();
    window.scrollTo({ top: 0 });
    document.body.classList.remove('nav-open');
  });
  render();
  document.body.classList.remove('is-loading');
}

start().catch((error) => {
  console.error(error);
  document.body.classList.remove('is-loading');
  el('view').textContent = 'Não foi possível iniciar o Mawe OS. Veja o console do navegador para detalhes.';
});
