/**
 * Prospecção › Quem chamar hoje: a lista de quem precisa de mensagem hoje,
 * com os botões da cadência (Mandei, Respondeu, Sem resposta...).
 */
import { registerActions } from '../core/events.ts';
import { pluralize } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { CALL_GROUPS, TALKING_STAGE, callToday, markNoReply, markReplied, markSent, readyToApproach, retryLead, startWarmup, type CallItem } from '../domain/cadence.ts';
import { commercialMetrics, whatsappLink } from '../domain/commercial.ts';
import { LOST_STAGE, WON_STAGE, stageLabel, stageTone } from '../domain/labels.ts';
import { moveOpportunity } from '../domain/operations.ts';
import { allowed, rerender, requirePermission, store, today } from '../app/context.ts';
import { avatarStack, badge, button, emptyState, externalLink } from '../ui/components.ts';
import { icon } from '../ui/icons.ts';
import { toast } from '../ui/overlay.ts';

const ui = { owner: 'todos' };

function instagramUrl(handle: string | undefined): string | null {
  const clean = (handle ?? '').trim().replace(/^@/, '');
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean)) return clean;
  if (!/^[\w.]+$/.test(clean)) return null;
  return `https://instagram.com/${clean}`;
}

function contactLinks(item: CallItem): SafeHtml {
  const wa = whatsappLink(item.opp.contact.phone, '');
  const ig = instagramUrl(item.opp.contact.instagram);
  return html`${wa ? externalLink(wa, 'WhatsApp') : ''}${ig ? externalLink(ig, 'Instagram') : ''}`;
}

function actions(item: CallItem): SafeHtml {
  if (!allowed('commercial:edit')) return html``;
  const id = item.opp.id;
  switch (item.group) {
    case 'primeira':
      return html`
        ${button({ label: 'Mandei', action: 'call:sent', variant: 'primary', size: 'sm', icon: 'send', data: { id } })}
        ${item.opp.stage !== 'aquecimento' && item.opp.contact.instagram ? button({ label: 'Aquecer antes', action: 'call:warm', size: 'sm', data: { id } }) : ''}`;
    case 'followup':
      return html`
        ${button({ label: item.opp.stage === TALKING_STAGE ? 'Mandei mensagem' : 'Mandei follow-up', action: 'call:sent', variant: 'primary', size: 'sm', icon: 'send', data: { id } })}
        ${item.opp.stage !== TALKING_STAGE ? button({ label: 'Respondeu', action: 'call:replied', size: 'sm', icon: 'chat', data: { id } }) : button({ label: 'Fechou!', action: 'call:won', size: 'sm', icon: 'check', data: { id } })}
        ${button({ label: 'Sem resposta', action: 'call:later', variant: 'ghost', size: 'sm', data: { id } })}`;
    case 'tentar':
      return html`
        ${button({ label: 'Tentar de novo', action: 'call:retry', variant: 'primary', size: 'sm', icon: 'repeat', data: { id } })}
        ${button({ label: 'Não rolou', action: 'call:lost', variant: 'ghost', size: 'sm', data: { id } })}`;
    case 'aquecendo':
      return button({ label: 'Abordar agora', action: 'call:ready', size: 'sm', data: { id } });
    default:
      return html`<a class="btn btn--secondary btn--sm" href="#/comercial/${id}">Abrir</a>`;
  }
}

function row(item: CallItem): SafeHtml {
  const { data } = store();
  const o = item.opp;
  return html`<li class="${cx('call-row', `call-row--${item.group}`)}">
    <div class="call-row__main">
      <a class="call-row__name" href="#/comercial/${o.id}">${o.company}</a>
      <span class="call-row__sub">${[o.contactName, o.segment, o.source].filter(Boolean).join(' · ')}</span>
      <span class="call-row__what">${badge(stageLabel(data, o.stage), stageTone(data, o.stage))} <strong>${item.what}</strong>${o.nextAction ? html`<span class="call-row__next">${o.nextAction}</span>` : ''}</span>
    </div>
    <div class="call-row__links">${contactLinks(item)}</div>
    <div class="call-row__actions">${actions(item)}${avatarStack(data, o.ownerIds)}</div>
  </li>`;
}

export function renderCallToday(): SafeHtml {
  const { data } = store();
  const t = today();
  const owner = ui.owner === 'todos' ? undefined : ui.owner;
  const items = callToday(data, t, owner);
  const groups = CALL_GROUPS.map((g) => ({ ...g, list: items.filter((i) => i.group === g.id) })).filter((g) => g.list.length);
  const toCall = items.filter((i) => i.group !== 'aquecendo').length;
  const m = commercialMetrics(data, 'mes', t, owner);
  const talking = data.opportunities.filter((o) => o.stage === TALKING_STAGE && (!owner || o.ownerIds.includes(owner))).length;
  return html`
    <div class="call-numbers">
      <div class="call-number call-number--main"><span>Pra chamar hoje</span><strong>${toCall}</strong><small>${toCall ? 'mensagens para mandar' : 'tudo em dia'}</small></div>
      <div class="call-number"><span>Em conversa</span><strong>${talking}</strong><small>em negociação</small></div>
      <div class="call-number"><span>Fechados no mês</span><strong>${m.won}</strong><small>${m.sentToday ? `${pluralize(m.sentToday, 'mensagem enviada', 'mensagens enviadas')} hoje` : 'nenhuma mensagem hoje ainda'}</small></div>
    </div>
    <div class="toolbar">
      <div class="segmented" role="tablist" aria-label="De quem">
        ${[{ value: 'todos', label: 'Todos' }, ...data.users.filter((u) => !u.guest).map((u) => ({ value: u.id, label: u.shortName }))].map(
          (o) => html`<button type="button" role="tab" class="${cx('segmented__item', ui.owner === o.value && 'is-active')}" aria-selected="${ui.owner === o.value ? 'true' : 'false'}" data-action="call:owner" data-value="${o.value}">${o.label}</button>`,
        )}
      </div>
      <a class="btn btn--ghost btn--sm" href="#/comercial/funil">${icon('kanban', 15)} Ver o funil completo</a>
    </div>
    ${groups.length
      ? groups.map(
          (g) => html`<section class="call-group">
            <header class="call-group__head"><h2>${g.title} <span class="panel__count">${g.list.length}</span></h2><p>${g.hint}</p></header>
            <ul class="call-list">${g.list.map(row)}</ul>
          </section>`,
        )
      : html`<div class="panel">${emptyState({
          icon: 'check',
          title: 'Ninguém para chamar hoje',
          text: 'Os follow-ups aparecem aqui sozinhos nos dias certos (3, 7 e 15 dias depois da primeira mensagem). Que tal cadastrar leads novos do Google Maps?',
          action: button({ label: 'Novo lead', action: 'opportunity:new', variant: 'primary', icon: 'plus' }),
        })}</div>`}
    <p class="muted small">${icon('info', 13)} A cadência: aquecer no Instagram por 3 dias, mandar a primeira mensagem, follow-ups em 3, 7 e 15 dias. Sem resposta, o lead volta daqui a 3 meses.</p>
  `;
}

async function run(fn: Parameters<ReturnType<typeof store>['apply']>[0], message: string): Promise<void> {
  requirePermission('commercial:edit');
  await store().apply(fn);
  toast(message);
}

registerActions({
  'call:owner': (el) => {
    ui.owner = el.dataset.value!;
    rerender();
  },
  'call:sent': (el) => run((d, ctx) => markSent(d, el.dataset.id!, today(), ctx), 'Mensagem registrada. O próximo follow-up já está agendado.'),
  'call:replied': (el) => run((d, ctx) => markReplied(d, el.dataset.id!, today(), ctx), 'Respondeu! Lead foi para Negociação.'),
  'call:later': (el) => run((d, ctx) => markNoReply(d, el.dataset.id!, today(), ctx), 'Guardado em Sem resposta. Ele volta daqui a 3 meses.'),
  'call:retry': (el) => run((d, ctx) => retryLead(d, el.dataset.id!, today(), ctx), 'Lead voltou para Pronto pra abordar.'),
  'call:warm': (el) => run((d, ctx) => startWarmup(d, el.dataset.id!, today(), ctx), 'Aquecimento começou: siga, curta e comente por 3 dias.'),
  'call:ready': (el) => run((d, ctx) => readyToApproach(d, el.dataset.id!, ctx), 'Pronto para a primeira mensagem.'),
  'call:won': (el) => run((d, ctx) => moveOpportunity(d, el.dataset.id!, WON_STAGE, ctx), 'Fechou! Abra o lead para virar cliente.'),
  'call:lost': (el) => run((d, ctx) => moveOpportunity(d, el.dataset.id!, LOST_STAGE, ctx), 'Marcado como Não rolou.'),
});

