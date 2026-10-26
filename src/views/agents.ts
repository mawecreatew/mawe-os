/**
 * Central de agentes.
 *
 * Nesta etapa NÃO existe modelo de IA conectado. A tela permite conhecer cada
 * agente, registrar pedidos e ver a sugestão de encaminhamento do coordenador
 * (feita por regras locais). Nenhuma resposta de IA é simulada.
 */
import { formatTimestamp } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import { navigate, type Route } from '../core/router.ts';
import { AGENT_GUARDRAILS, AGENTS, getAgent, type AgentDefinition } from '../agents/definitions.ts';
import { aiProvider } from '../agents/provider.ts';
import { routeRequest } from '../agents/routing.ts';
import { appendMessage, clearConversation } from '../domain/operations.ts';
import { findUser } from '../domain/selectors.ts';
import type { AgentId, ConversationMessage } from '../domain/types.ts';
import { store } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { avatar, button, emptyState, notice, pageHeader, panel } from '../ui/components.ts';
import { icon } from '../ui/icons.ts';
import { confirmAction, toast } from '../ui/overlay.ts';

const NO_MODEL_TEXT =
  'Nenhum modelo de IA está conectado ao Mawe OS. Seu pedido foi registrado nesta conversa, mas nenhuma resposta foi gerada.';

/** Rascunhos de mensagem por agente (ex.: contexto preparado a partir de uma oportunidade). */
const drafts = new Map<AgentId, string>();

export function setAgentDraft(agentId: AgentId, text: string): void {
  drafts.set(agentId, text);
}

function isAgentId(value: string | undefined): value is AgentId {
  return AGENTS.some((a) => a.id === value);
}

registerForms({
  'agent:send': async (form, values) => {
    const agentId = form.dataset.agent as AgentId;
    const text = values.text('message');
    if (!text) return;
    drafts.delete(agentId);
    const userId = store().currentUser.id;
    await store().apply((draft, ctx) => {
      appendMessage(draft, agentId, { role: 'user', authorId: userId, text }, ctx);
      if (agentId === 'coordenador') {
        const result = routeRequest(text);
        const routingText =
          result.agentId === 'coordenador'
            ? 'Encaminhamento por regras locais: não identifiquei com segurança qual especialista deve receber este pedido. Reformule com mais detalhes ou escolha um agente diretamente.'
            : `Encaminhamento por regras locais: este pedido seria direcionado ao ${getAgent(result.agentId).name}.`;
        appendMessage(
          draft,
          agentId,
          { role: 'system', authorId: null, text: `${routingText}\n${NO_MODEL_TEXT}`, routing: { agentId: result.agentId, matched: result.matched } },
          ctx,
        );
      } else {
        appendMessage(draft, agentId, { role: 'system', authorId: null, text: NO_MODEL_TEXT }, ctx);
      }
    });
  },
});

registerActions({
  'agent:example': (el) => {
    const textarea = document.querySelector<HTMLTextAreaElement>('#agent-message');
    if (textarea) {
      textarea.value = el.dataset.text ?? '';
      textarea.focus();
    }
  },
  'agent:forward': async (el) => {
    const target = el.dataset.target as AgentId;
    const messageId = el.dataset.message;
    const conversation = store().data.conversations.find((c) => c.agentId === 'coordenador');
    const index = conversation?.messages.findIndex((m) => m.id === messageId) ?? -1;
    const original = index > 0 ? conversation!.messages[index - 1] : undefined;
    if (!original) return;
    const userId = store().currentUser.id;
    await store().apply((draft, ctx) => {
      appendMessage(draft, target, { role: 'user', authorId: userId, text: original.text }, ctx);
      appendMessage(draft, target, { role: 'system', authorId: null, text: `Pedido encaminhado pelo Coordenador.\n${NO_MODEL_TEXT}` }, ctx);
    });
    toast(`Pedido encaminhado ao ${getAgent(target).name}.`);
    navigate(`/agentes/${target}`);
  },
  'agent:clear': async (el) => {
    const agentId = el.dataset.agent as AgentId;
    const ok = await confirmAction({ title: 'Limpar conversa', text: 'Todos os registros desta conversa serão apagados.', confirmLabel: 'Limpar' });
    if (!ok) return;
    await store().apply((draft) => clearConversation(draft, agentId));
  },
});

function agentMark(agent: AgentDefinition, size = 18): SafeHtml {
  return html`<span class="agent-mark agent-mark--${agent.id}" aria-hidden="true">${icon('agents', size)}</span>`;
}

function renderOverview(): SafeHtml {
  return html`
    ${pageHeader({
      title: 'Central de agentes',
      subtitle: 'Assistentes de trabalho especializados. Eles preparam materiais; as decisões e os envios são sempre dos sócios.',
    })}
    ${aiProvider.connected
      ? ''
      : notice({
          tone: 'warning',
          icon: 'info',
          title: 'Nenhum modelo de IA conectado',
          text: 'Você já pode conhecer os agentes, registrar pedidos e ver o encaminhamento sugerido pelo coordenador (por regras locais). As respostas de IA só aparecerão depois da integração com um modelo — nada aqui é simulado.',
        })}
    <div class="agent-grid">
      ${AGENTS.map(
        (agent) => html`
          <article class="agent-card">
            <header class="agent-card__header">
              ${agentMark(agent, 20)}
              <div>
                <h2 class="agent-card__name">${agent.name}</h2>
                <p class="agent-card__role">${agent.role}</p>
              </div>
            </header>
            <p class="agent-card__summary">${agent.summary}</p>
            <ul class="bullet-list">${agent.responsibilities.slice(0, 3).map((r) => html`<li>${r}</li>`)}</ul>
            <footer class="agent-card__footer">
              <span class="status-pill status-pill--off">Sem modelo conectado</span>
              <a class="btn btn--secondary btn--sm" href="#/agentes/${agent.id}">Abrir conversa ${icon('arrowRight', 14)}</a>
            </footer>
          </article>`,
      )}
    </div>
    ${panel({
      title: 'Regras válidas para todos os agentes',
      icon: 'lock',
      body: html`<ul class="bullet-list bullet-list--check">${AGENT_GUARDRAILS.map((g) => html`<li>${g}</li>`)}</ul>`,
    })}
  `;
}

function renderMessage(message: ConversationMessage, agentId: AgentId): SafeHtml {
  const { data } = store();
  if (message.role === 'user') {
    const author = findUser(data, message.authorId);
    return html`<li class="msg msg--user">
      ${avatar(author)}
      <div class="msg__bubble">
        <p class="msg__meta">${author?.shortName ?? '—'} · ${formatTimestamp(message.at)}</p>
        <p>${multiline(message.text)}</p>
      </div>
    </li>`;
  }
  const routed = message.routing && message.routing.agentId !== 'coordenador' ? message.routing : null;
  return html`<li class="msg msg--system">
    <span class="msg__system-icon">${icon(routed ? 'route' : 'info', 16)}</span>
    <div class="msg__bubble">
      <p class="msg__meta">Aviso do sistema (não é resposta de IA) · ${formatTimestamp(message.at)}</p>
      <p>${multiline(message.text)}</p>
      ${routed && routed.matched.length ? html`<p class="msg__matched">Termos identificados: ${routed.matched.join(', ')}</p>` : ''}
      ${routed && agentId === 'coordenador'
        ? button({ label: `Encaminhar ao ${getAgent(routed.agentId).name}`, action: 'agent:forward', size: 'sm', icon: 'arrowRight', data: { target: routed.agentId, message: message.id } })
        : ''}
    </div>
  </li>`;
}

function renderAgent(agent: AgentDefinition): SafeHtml {
  const conversation = store().data.conversations.find((c) => c.agentId === agent.id);
  const messages = conversation?.messages ?? [];
  const draft = drafts.get(agent.id) ?? '';

  return html`
    ${pageHeader({
      title: agent.name,
      back: { href: '#/agentes', label: 'Central de agentes' },
      subtitle: agent.summary,
      actions: messages.length ? button({ label: 'Limpar conversa', action: 'agent:clear', variant: 'ghost', icon: 'trash', data: { agent: agent.id } }) : undefined,
    })}

    <div class="agent-layout">
      <section class="chat panel" aria-label="Conversa com ${agent.name}">
        <div class="chat__status">
          <span class="status-pill status-pill--off">${aiProvider.name}</span>
          <span class="muted">Pedidos ficam registrados; nenhuma resposta é gerada nesta etapa.</span>
        </div>
        ${messages.length
          ? html`<ol class="chat__messages">${messages.map((m) => renderMessage(m, agent.id))}</ol>`
          : emptyState({
              icon: 'message',
              title: 'Nenhum pedido registrado',
              text: agent.id === 'coordenador'
                ? 'Descreva o que precisa. O coordenador indica qual especialista deve receber o pedido.'
                : 'Descreva o que precisa ou use um dos exemplos abaixo.',
            })}
        <form class="chat__composer" data-form="agent:send" data-agent="${agent.id}">
          <label class="visually-hidden" for="agent-message">Mensagem para ${agent.name}</label>
          <textarea id="agent-message" class="input textarea" name="message" rows="${draft ? 8 : 3}" placeholder="Escreva seu pedido para o ${agent.name.toLowerCase()}">${draft}</textarea>
          <div class="chat__composer-foot">
            <div class="chips">
              ${agent.examplePrompts.map((p) => html`<button type="button" class="chip" data-action="agent:example" data-text="${p}">${p}</button>`)}
            </div>
            <button type="submit" class="btn btn--primary">${icon('send', 16)}<span>Registrar pedido</span></button>
          </div>
        </form>
      </section>

      <aside class="agent-info">
        ${panel({
          title: 'Função',
          body: html`
            <div class="agent-info__head">${agentMark(agent, 22)}<div><strong>${agent.name}</strong><small>${agent.role}</small></div></div>
            <ul class="bullet-list">${agent.responsibilities.map((r) => html`<li>${r}</li>`)}</ul>
          `,
        })}
        ${panel({
          title: 'Contexto que poderá consultar',
          body: html`<ul class="bullet-list">${agent.contextSources.map((r) => html`<li>${r}</li>`)}</ul>`,
        })}
        ${panel({
          title: 'Limites',
          icon: 'lock',
          body: html`<ul class="bullet-list bullet-list--check">${AGENT_GUARDRAILS.map((g) => html`<li>${g}</li>`)}</ul>`,
        })}
        <details class="${cx('panel', 'details')}">
          <summary>Instruções preparadas para o modelo</summary>
          <pre class="pre">${agent.instructions}</pre>
        </details>
      </aside>
    </div>
  `;
}

export const agentsView: View = {
  title: (route: Route) => (isAgentId(route.params[0]) ? getAgent(route.params[0]).name : 'Central de agentes'),
  render: (route: Route) => {
    const id = route.params[0];
    if (id && isAgentId(id)) return renderAgent(getAgent(id));
    return renderOverview();
  },
};
