/**
 * Início: a Central da agência.
 *
 * 1. As 3 prioridades de cada pessoa (com botão para mais).
 * 2. Arcos de atalho com os números que importam.
 * 3. Pra fazer hoje (tarefas, follow-ups, pós-venda, cobranças e vencimentos),
 *    com 4 números ao lado.
 * 4. Alinhamento da noite.
 *
 * O gráfico de faturamento fica no Financeiro e o funil no Comercial.
 */
import { formatShortDate, formatWeekday, monthKey, relativeDay } from '../core/dates.ts';
import { formatCurrency, pluralize } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { CADENCE_STAGE_IDS, LATER_STAGE } from '../domain/cadence.ts';
import { contractsEndingSoon } from '../domain/clientcare.ts';
import { monthRevenue, monthlyRecurringRevenue, upcomingBills } from '../domain/finance.ts';
import { todayFocus, type FocusItem, type FocusKind } from '../domain/insights.ts';
import { FINAL_STAGES } from '../domain/labels.ts';
import { activeProjects, greeting, overdueTasks, pendingTasks } from '../domain/selectors.ts';
import { allowed, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { renderLearningOfTheDay } from './learnings.ts';
import { avatarStack, button, emptyState, panel } from '../ui/components.ts';
import { icon, type IconName } from '../ui/icons.ts';
import { renderAlignment, renderPriorities } from './day.ts';

const SHORT_MONTHS = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];

// ---------------------------------------------------------------- Arcos

interface Arch {
  label: string;
  value: string;
  sub: string;
  href: string;
  icon: IconName;
  tone: string;
}

function archesData(): Arch[] {
  const { data } = store();
  const t = today();
  const leads = data.opportunities.filter((o) => !FINAL_STAGES.includes(o.stage) && o.stage !== LATER_STAGE).length;
  const clients = data.clients.filter((c) => c.contractStatus !== 'concluido' && c.contractStatus !== 'pausado').length;
  const projects = activeProjects(data).length;
  const contracts = data.contracts ?? [];
  const ending = contractsEndingSoon(data, t).length;
  const arches: Arch[] = [
    { label: 'Prospecção', value: String(leads), sub: 'leads ativos', href: '#/comercial', icon: 'target', tone: 'gold' },
    { label: 'Clientes', value: String(clients), sub: 'ativos', href: '#/clientes', icon: 'clients', tone: 'rose' },
    { label: 'Projetos', value: String(projects), sub: 'em andamento', href: '#/projetos', icon: 'kanban', tone: 'plum' },
    { label: 'Contratos', value: String(contracts.length), sub: ending ? `${ending} ${ending === 1 ? 'vence' : 'vencem'} logo` : 'nenhum vencendo', href: '#/contratos', icon: 'file', tone: 'blue' },
  ];
  if (allowed('finance:view')) {
    arches.push({ label: 'Financeiro', value: compactMoney(monthRevenue(data, monthKey(t))), sub: 'faturamento do mês', href: '#/financeiro', icon: 'wallet', tone: 'green' });
  }
  arches.push({ label: 'Processos', value: String((data.processes ?? []).length), sub: 'etapas no manual', href: '#/processos', icon: 'route', tone: 'amber' });
  return arches;
}

function compactMoney(value: number): string {
  if (value >= 10_000) return `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return formatCurrency(value);
}

function renderArches(): SafeHtml {
  return html`<nav class="arches" aria-label="Atalhos da agência">
    ${archesData().map(
      (a) => html`<a class="${cx('arch', `arch--${a.tone}`)}" href="${a.href}">
        <span class="arch__icon">${icon(a.icon, 18)}</span>
        <span class="arch__value">${a.value}</span>
        <span class="arch__label">${a.label}</span>
        <span class="arch__sub">${a.sub}</span>
      </a>`,
    )}
  </nav>`;
}

// ---------------------------------------------------------------- Pra fazer hoje

export const FOCUS_META: Record<FocusKind, { icon: IconName; label: string }> = {
  followup: { icon: 'commercial', label: 'Comercial' },
  task: { icon: 'tasks', label: 'Tarefa' },
  bill: { icon: 'wallet', label: 'Financeiro' },
  delivery: { icon: 'flag', label: 'Entrega' },
  domain: { icon: 'globe', label: 'Domínio' },
  aftersales: { icon: 'chat', label: 'Pós-venda' },
  contract: { icon: 'repeat', label: 'Contrato' },
  site: { icon: 'globe', label: 'Relatório do site' },
  preview: { icon: 'clock', label: 'Prévia' },
  payment: { icon: 'wallet', label: 'Pagamento' },
};

export function focusRow(item: FocusItem, t: string): SafeHtml {
  const { data } = store();
  const meta = FOCUS_META[item.kind];
  const [, m, d] = item.date.split('-');
  const check = item.taskId
    ? html`<input type="checkbox" class="check" data-change="task:toggle" data-id="${item.taskId}" aria-label="Concluir: ${item.title}" />`
    : item.movementKey
      ? html`<input type="checkbox" class="check" data-change="finance:toggle" data-key="${item.movementKey}" ${allowed('finance:edit') ? '' : 'disabled'}
          aria-label="Marcar como ${item.billKind === 'entrada' ? 'recebida' : 'paga'}: ${item.title}" />`
      : '';
  return html`<li class="${cx('todo', `todo--${item.kind}`, item.overdue && 'is-late')}">
    <span class="todo__date" aria-hidden="true"><strong>${d}</strong><small>${SHORT_MONTHS[Number(m) - 1]}</small></span>
    <a class="todo__main" href="${item.href}">
      <span class="todo__kind">${meta.label}${item.overdue ? ' · atrasado' : item.date === t ? '' : ` · ${relativeDay(item.date, t)}`}</span>
      <span class="todo__title">${item.title}</span>
      <span class="todo__sub">${item.subtitle}</span>
    </a>
    <span class="todo__aside">
      ${item.amount !== undefined
        ? html`<span class="${cx('todo__amount', item.billKind === 'entrada' && 'text-success')}">${item.billKind === 'entrada' ? '+' : '−'} ${formatCurrency(item.amount, true)}</span>`
        : avatarStack(data, item.ownerIds)}
      ${check}
    </span>
  </li>`;
}

function renderTodo(): SafeHtml {
  const { data } = store();
  const t = today();
  const items = todayFocus(data, t, { finance: allowed('finance:view') });
  // Atrasados primeiro, depois na ordem das datas.
  const sorted = [...items.filter((i) => i.overdue), ...items.filter((i) => !i.overdue)];
  const shown = sorted.slice(0, 10);
  const late = items.filter((i) => i.overdue).length;
  return panel({
    title: 'Pra fazer hoje',
    icon: 'flag',
    count: items.length,
    className: 'todo-panel',
    action: late ? html`<span class="status-pill status-pill--alert">${pluralize(late, 'atrasado', 'atrasados')}</span>` : undefined,
    body: items.length
      ? html`<ul class="todos">${shown.map((item) => focusRow(item, t))}</ul>
          ${items.length > shown.length ? html`<p class="panel__foot">+ ${items.length - shown.length} itens · veja em <a href="#/tarefas">Tarefas</a> e <a href="#/comercial">Prospecção</a></p>` : ''}`
      : emptyState({
          icon: 'check',
          compact: true,
          title: 'Tudo em dia por hoje',
          text: 'Tarefas, follow-ups, pós-venda, cobranças e vencimentos aparecem aqui. Bom momento para prospectar.',
          action: html`<a class="btn btn--secondary btn--sm" href="#/comercial">Abrir a Prospecção</a>`,
        }),
  });
}

// ---------------------------------------------------------------- Números

function numberCard(label: string, value: string, sub: string, href: string, tone?: 'dark' | 'alert'): SafeHtml {
  return html`<a class="${cx('num-card', tone && `num-card--${tone}`)}" href="${href}">
    <span class="num-card__label">${label}</span>
    <span class="num-card__value">${value}</span>
    <span class="num-card__sub">${sub}</span>
  </a>`;
}

function renderNumbers(): SafeHtml {
  const { data, currentUser } = store();
  const t = today();
  const inCadence = data.opportunities.filter((o) => CADENCE_STAGE_IDS.includes(o.stage) && o.stage !== LATER_STAGE);
  const talking = inCadence.filter((o) => o.stage === 'negociacao').length;
  const cadenceCard = numberCard('Em cadência', String(inCadence.length), talking ? `${talking} em negociação` : 'leads sendo trabalhados', '#/comercial');
  if (!allowed('finance:view')) {
    const mine = pendingTasks(data, t, currentUser.id).length;
    const late = overdueTasks(data, t).length;
    return html`<div class="num-grid">
      ${cadenceCard}
      ${numberCard('Minhas tarefas', String(mine), 'abertas', '#/tarefas')}
      ${numberCard('Atrasadas', String(late), 'tarefas da equipe', '#/tarefas', late ? 'alert' : undefined)}
      ${numberCard('Projetos', String(activeProjects(data).length), 'em andamento', '#/projetos')}
    </div>`;
  }
  const month = monthKey(t);
  const receivable = upcomingBills(data, t, 30).filter((m) => m.kind === 'entrada');
  const toReceive = receivable.reduce((s, m) => s + m.amount, 0);
  const late = receivable.filter((m) => m.dueDate < t);
  const mrr = monthlyRecurringRevenue(data, month);
  return html`<div class="num-grid">
    ${numberCard('Entrou no mês', formatCurrency(monthRevenue(data, month), true), 'recebido até hoje', '#/financeiro', 'dark')}
    ${numberCard('A receber', formatCurrency(toReceive, true), late.length ? `${pluralize(late.length, 'parcela atrasada', 'parcelas atrasadas')}` : 'próximos 30 dias', '#/financeiro', late.length ? 'alert' : undefined)}
    ${cadenceCard}
    ${numberCard('Fixo mensal', formatCurrency(mrr.total, true), mrr.plans ? pluralize(mrr.plans, 'manutenção ativa', 'manutenções ativas') : 'nenhum plano ativo', '#/clientes')}
  </div>`;
}

export const dashboardView: View = {
  title: () => 'Início',
  render: () => {
    const { currentUser } = store();
    const t = today();
    return html`
      <header class="central-head">
        <div>
          <p class="central-head__eyebrow">MaweCreate · ${formatWeekday(t)}</p>
          <h1 class="page-title central-head__title">Central da <em>agência</em></h1>
          <p class="central-head__hello">${greeting(currentUser.name, store().now())} Vamos ao que importa hoje.</p>
        </div>
        <div class="central-head__actions">
          ${button({ label: 'Tarefa', action: 'task:new', icon: 'plus' })}
          ${allowed('finance:edit') ? button({ label: 'Entrada', action: 'finance:new-in', icon: 'plus' }) : ''}
          ${button({ label: 'Novo lead', action: 'opportunity:new', variant: 'primary', icon: 'plus' })}
        </div>
      </header>

      ${renderPriorities()}
      ${renderArches()}

      <div class="central-grid">
        <div class="central-grid__main">${renderTodo()}</div>
        <aside class="central-grid__side">${renderNumbers()}${renderLearningOfTheDay()}</aside>
      </div>

      ${renderAlignment()}
      <p class="central-foot muted small">${icon('info', 13)} O gráfico de faturamento está no <a href="#/financeiro">Financeiro</a> e o funil em <a href="#/comercial/funil">Prospecção › Funil</a>. Hoje é ${formatShortDate(t)}.</p>
    `;
  },
};
