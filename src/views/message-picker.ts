/**
 * Janela "Mensagem do dia": mostra a mensagem pronta certa para o momento
 * (primeira mensagem, follow-up, cliente que sumiu...), já com o nome do
 * cliente, com todas as opções e os botões Copiar e Abrir no WhatsApp.
 */
import { registerActions } from '../core/events.ts';
import { html } from '../core/html.ts';
import { whatsappLink } from '../domain/commercial.ts';
import { MESSAGE_STEPS, fillMessage, messageForStep, messageOptions } from '../domain/messages.ts';
import type { MessageStep } from '../domain/types.ts';
import { store } from '../app/context.ts';
import { button, emptyState } from '../ui/components.ts';
import { icon } from '../ui/icons.ts';
import { openModal, toast } from '../ui/overlay.ts';

export interface MessageTarget {
  company: string;
  contact: string;
  phone?: string;
  amount?: string;
  pix?: string;
}

/** Textos abertos agora (o botão Copiar lê daqui, não do HTML). */
let shown: string[] = [];

export function openMessagePicker(step: MessageStep, target: MessageTarget): void {
  const { data, currentUser } = store();
  const item = messageForStep(data, step);
  const meta = MESSAGE_STEPS.find((s) => s.value === step);
  if (!item) {
    openModal({
      title: meta?.label ?? 'Mensagem',
      body: emptyState({
        icon: 'message',
        compact: true,
        title: 'Ainda não tem mensagem para este momento',
        text: 'Crie uma em Mensagens prontas e escolha o momento dela no formulário.',
        action: html`<a class="btn btn--primary" href="#/biblioteca" data-action="modal:close">Abrir Mensagens prontas</a>`,
      }),
    });
    return;
  }
  const values = { company: target.company, contact: target.contact, me: currentUser.shortName || currentUser.name, amount: target.amount, pix: target.pix ?? data.agency?.pix };
  shown = messageOptions(item).map((t) => fillMessage(t, values));
  openModal({
    title: item.title,
    description: `${meta?.label ?? ''} · para ${target.company}. Revise antes de mandar.`,
    size: 'lg',
    body: html`<div class="msg-pick">
      ${shown.map((text, i) => {
        const wa = whatsappLink(target.phone, text);
        return html`<section class="msg-pick__option">
          ${shown.length > 1 ? html`<h3 class="msg-pick__title">Opção ${i + 1}</h3>` : ''}
          <p class="msg-pick__text">${text}</p>
          <div class="msg-pick__actions">
            ${button({ label: 'Copiar', action: 'msgpick:copy', icon: 'copy', size: 'sm', data: { index: String(i) } })}
            ${wa ? html`<a class="btn btn--primary btn--sm" href="${wa}" target="_blank" rel="noopener noreferrer">${icon('send', 14)} Abrir no WhatsApp</a>` : ''}
          </div>
        </section>`;
      })}
      <p class="muted small">${icon('info', 13)} Campos entre chaves, como {{valor}}, ficaram para você completar. Para mudar os textos, edite em <a href="#/biblioteca" data-action="modal:close">Mensagens prontas</a>.</p>
    </div>`,
  });
}

registerActions({
  'msgpick:copy': async (el) => {
    const text = shown[Number(el.dataset.index)];
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast('Mensagem copiada.');
    } catch {
      toast('Não foi possível copiar automaticamente. Selecione o texto e copie.', 'error');
    }
  },
});
