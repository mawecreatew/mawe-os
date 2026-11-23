/**
 * Chat da equipe: recados de trabalho entre os sócios, guardados junto com os
 * dados da agência. A mensagem chega para o outro em alguns segundos (quando
 * a tela do chat está aberta) e não manda notificação no celular.
 */
import { formatShortDate, formatTimestamp } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import { findUser, relatedLabel } from '../domain/selectors.ts';
import { deleteChatMessage, markChatRead, sendChatMessage, unreadChat } from '../domain/workspace.ts';
import type { ChatMessage, RelatedRef } from '../domain/types.ts';
import { store } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { avatar, emptyState, notice, pageHeader } from '../ui/components.ts';
import { icon } from '../ui/icons.ts';
import { confirmAction, toast } from '../ui/overlay.ts';

/** Rascunho da mensagem (não se perde quando a tela redesenha com mensagens novas). */
let draftText = '';
let draftRelated = '';
let markingRead = false;

function relatedOptions(): Array<{ value: string; label: string }> {
  const { data } = store();
  return [
    ...data.clients.map((c) => ({ value: `client:${c.id}`, label: `Cliente: ${c.company}` })),
    ...data.projects.filter((p) => p.status !== 'publicado').map((p) => ({ value: `project:${p.id}`, label: `Projeto: ${p.name}` })),
    ...data.opportunities.filter((o) => o.stage !== 'ganho' && o.stage !== 'perdido').map((o) => ({ value: `opportunity:${o.id}`, label: `Lead: ${o.company}` })),
  ].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

function parseRelated(value: string): RelatedRef | null {
  const [type, id] = value.split(':');
  if (!id || !['client', 'project', 'opportunity'].includes(type)) return null;
  return { type: type as RelatedRef['type'], id };
}

function messageRow(m: ChatMessage, previous: ChatMessage | undefined, meId: string): SafeHtml {
  const { data } = store();
  const author = findUser(data, m.authorId);
  const mine = m.authorId === meId;
  const newDay = !previous || previous.at.slice(0, 10) !== m.at.slice(0, 10);
  const grouped = !newDay && previous?.authorId === m.authorId && Date.parse(m.at) - Date.parse(previous.at) < 5 * 60_000;
  const related = relatedLabel(data, m.related);
  return html`
    ${newDay ? html`<li class="chat__day"><span>${formatShortDate(m.at.slice(0, 10))}</span></li>` : ''}
    <li class="${cx('chat__msg', mine && 'is-mine', grouped && 'is-grouped')}">
      ${grouped || mine ? html`<span class="chat__avatar-space"></span>` : avatar(author)}
      <div class="chat__bubble">
        ${grouped || mine ? '' : html`<span class="chat__author">${author?.shortName.split(' ')[0] ?? 'Alguém'}</span>`}
        <p class="chat__text">${multiline(m.text)}</p>
        <span class="chat__meta">
          ${related ? html`<a href="${related.href}">${icon('link', 12)} ${related.label}</a>` : ''}
          <time datetime="${m.at}">${formatTimestamp(m.at).split(' ').at(-1)}</time>
          ${mine ? html`<button type="button" class="chat__delete" data-action="chat:delete" data-id="${m.id}" aria-label="Apagar mensagem">${icon('trash', 12)}</button>` : ''}
        </span>
      </div>
    </li>`;
}

function render(): SafeHtml {
  const { data, currentUser } = store();
  const messages = (data.chat ?? []).slice(-200);
  // Ao abrir o chat, marca como lido (fora do desenho da tela).
  if (unreadChat(data, currentUser.id) && !markingRead) {
    markingRead = true;
    queueMicrotask(() => {
      void store()
        .apply((draft, ctx) => markChatRead(draft, ctx))
        .catch(() => undefined)
        .finally(() => (markingRead = false));
    });
  }
  // Depois de desenhar, rola para a última mensagem.
  queueMicrotask(() => {
    const list = document.getElementById('chat-list');
    if (list) list.scrollTop = list.scrollHeight;
  });
  return html`
    ${pageHeader({ title: 'Chat da equipe', subtitle: 'Recados de trabalho que ficam guardados junto com o cliente ou o projeto.' })}
    <section class="chat panel">
      <ul class="chat__list" id="chat-list" aria-live="polite">
        ${messages.length
          ? messages.map((m, i) => messageRow(m, messages[i - 1], currentUser.id))
          : html`<li>${emptyState({ icon: 'chat', compact: true, title: 'Nenhuma mensagem ainda', text: 'Mande o primeiro recado. Dá para ligar a mensagem a um cliente, projeto ou lead.' })}</li>`}
      </ul>
      <form class="chat__form" data-form="chat:send">
        <label class="visually-hidden" for="chat-related">Sobre</label>
        <select class="input select chat__related" id="chat-related" name="related" data-change="chat:related">
          <option value="">Sobre: assunto geral</option>
          ${relatedOptions().map((o) => html`<option value="${o.value}" ${o.value === draftRelated ? 'selected' : ''}>${o.label}</option>`)}
        </select>
        <div class="chat__compose">
          <label class="visually-hidden" for="chat-text">Mensagem</label>
          <textarea class="input textarea" id="chat-text" name="text" rows="2" placeholder="Escreva um recado... (Enter envia, Shift + Enter quebra a linha)" data-input="chat:typing">${draftText}</textarea>
          <button class="btn btn--primary" type="submit">${icon('send', 16)}<span>Enviar</span></button>
        </div>
      </form>
    </section>
    ${notice({ title: 'Como o chat funciona', text: 'Com a tela do chat aberta, as mensagens novas aparecem em alguns segundos. O celular não apita: para urgência, o WhatsApp continua sendo melhor.' })}
  `;
}

export const chatView: View = { title: () => 'Chat da equipe', render };

registerForms({
  'chat:send': async (form) => {
    const textarea = form.querySelector<HTMLTextAreaElement>('#chat-text');
    const text = textarea?.value ?? draftText;
    const related = parseRelated(draftRelated);
    draftText = '';
    try {
      await store().apply((draft, ctx) => sendChatMessage(draft, text, related, ctx));
      draftRelated = '';
      document.getElementById('chat-text')?.focus();
    } catch (error) {
      draftText = text;
      throw error;
    }
  },
});

registerActions({
  'chat:typing': (el) => {
    draftText = (el as HTMLTextAreaElement).value;
  },
  'chat:related': (el) => {
    draftRelated = (el as HTMLSelectElement).value;
  },
  'chat:delete': async (el) => {
    const ok = await confirmAction({ title: 'Apagar mensagem?', text: 'Ela some para os dois.', confirmLabel: 'Apagar' });
    if (!ok) return;
    await store().apply((draft, ctx) => deleteChatMessage(draft, el.dataset.id!, ctx));
    toast('Mensagem apagada.');
  },
});

// Enter envia; Shift + Enter quebra a linha.
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.id !== 'chat-text' || event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    target.closest('form')?.requestSubmit();
  });
}
