/**
 * Partes do Comercial que ficam em janelas: registrar contato, mandar
 * mensagem pronta no WhatsApp, motivo de perda e a aba de relatórios.
 */
import { formatShortDate, type ISODate } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, pluralize } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { categoryNames } from '../domain/categories.ts';
import {
  CONTACT_CHANNELS,
  channelLabel,
  commercialReport,
  contactLog,
  fillTemplate,
  logContact,
  removeContact,
  setLostReason,
  stageKind,
  whatsappLink,
  whatsappNumber,
  type ContactInput,
} from '../domain/commercial.ts';
import { LOST_STAGE, WON_STAGE, pipelineStages, stageLabel } from '../domain/labels.ts';
import { updateOpportunity } from '../domain/operations.ts';
import { findOpportunity, findUser } from '../domain/selectors.ts';
import type { ContactChannel, Opportunity } from '../domain/types.ts';
import { allowed, requirePermission, store, today } from '../app/context.ts';
import { button, emptyState, notice, pageHeader, panel, statCard } from '../ui/components.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, openModal, toast } from '../ui/overlay.ts';
import { commercialTabs } from './proposals.ts';

// ---------------------------------------------------------------- Registrar contato

/** Próxima etapa sugerida depois de um contato (ex.: mandou a mensagem → etapa que espera o cliente). */
function suggestedStage(opp: Opportunity, direction: 'enviado' | 'recebido'): string {
  const data = store().data;
  const stages = pipelineStages(data).filter((s) => s.id !== WON_STAGE && s.id !== LOST_STAGE);
  const index = stages.findIndex((s) => s.id === opp.stage);
  const after = stages.slice(index + 1);
  const kind = stageKind(data, opp.stage);
  if (direction === 'enviado' && kind === 'nossa_vez') return after.find((s) => s.kind === 'vez_cliente')?.id ?? '';
  if (direction === 'recebido' && kind !== 'nossa_vez') {
    const replied = stages.find((s) => /respond/i.test(s.label));
    return replied && replied.id !== opp.stage ? replied.id : '';
  }
  return '';
}

export function openContactForm(oppId: string, direction: 'enviado' | 'recebido' = 'enviado', channel: ContactChannel = 'whatsapp'): void {
  const { data } = store();
  const opp = findOpportunity(data, oppId);
  if (!opp) return;
  const suggestion = suggestedStage(opp, direction);
  openModal({
    title: direction === 'enviado' ? `Registrar contato com ${opp.company}` : `${opp.company} respondeu`,
    description: 'Cada contato conta nos números do Comercial e nas metas. O lead deixa de aparecer como pendente.',
    body: html`
      <form class="form" data-form="contact:save" data-id="${opp.id}">
        <div class="form-grid">
          ${selectField({
            name: 'direction',
            label: 'O que aconteceu',
            value: direction,
            options: [
              { value: 'enviado', label: 'Nós falamos com o cliente' },
              { value: 'recebido', label: 'O cliente respondeu' },
            ],
          })}
          ${selectField({ name: 'channel', label: 'Por onde', value: channel, options: CONTACT_CHANNELS })}
          ${textField({ name: 'date', label: 'Quando', type: 'date', value: today(), required: true })}
          ${selectField({
            name: 'moveTo',
            label: 'Depois disso, mover para',
            value: suggestion,
            emptyLabel: `Manter em "${stageLabel(data, opp.stage)}"`,
            options: pipelineStages(data).filter((s) => s.id !== opp.stage).map((s) => ({ value: s.id, label: s.label })),
          })}
        </div>
        ${textField({ name: 'note', label: 'Anotação (opcional)', placeholder: 'Ex.: mandei o áudio e o link da prévia', autofocus: true })}
        ${textField({ name: 'followUpDate', label: 'Lembrete ou próxima ação (opcional)', type: 'date', value: opp.followUpDate && opp.followUpDate > today() ? opp.followUpDate : '', hint: 'Deixe vazio se não precisa de lembrete. Em etapas que esperam o cliente, isso nunca vira "atrasado".' })}
        ${formActions('Registrar')}
      </form>`,
  });
}

registerForms({
  'contact:save': async (form, values) => {
    requirePermission('commercial:edit');
    const id = form.dataset.id!;
    const input: ContactInput = {
      direction: values.text('direction') as 'enviado' | 'recebido',
      channel: values.text('channel') as ContactChannel,
      date: values.text('date'),
      note: values.text('note'),
    };
    const moveTo = values.optional('moveTo');
    await store().apply((draft, ctx) => logContact(draft, id, input, ctx, { moveTo, followUpDate: values.optional('followUpDate') }));
    closeModal();
    toast(input.direction === 'enviado' ? 'Contato registrado.' : 'Resposta registrada.');
    if (moveTo === LOST_STAGE) askLostReason([id]);
  },
  'lost:save': async (form, values) => {
    requirePermission('commercial:edit');
    const ids = (form.dataset.ids ?? '').split(',').filter(Boolean);
    await store().apply((draft, ctx) => setLostReason(draft, ids, values.optional('reason'), values.text('note'), ctx));
    closeModal();
    toast('Motivo registrado. Ele aparece em Comercial › Relatórios.');
  },
  'whatsapp:send': async (form, values) => {
    requirePermission('commercial:edit');
    const id = form.dataset.id!;
    const opp = findOpportunity(store().data, id);
    if (!opp) return;
    const phone = values.text('phone') || opp.contact.phone || '';
    const text = values.text('message');
    const link = whatsappLink(phone, text);
    if (!link) throw new Error('Confira o número: use DDD + número, por exemplo (47) 99999-9999.');
    // Abre antes de salvar para o navegador não bloquear a nova aba.
    window.open(link, '_blank', 'noopener');
    await store().apply((draft, ctx) => {
      if (phone !== opp.contact.phone) updateOpportunity(draft, id, { contact: { ...opp.contact, phone } }, ctx);
      logContact(draft, id, { direction: 'enviado', channel: 'whatsapp', date: today(), note: values.text('template') ? `Mensagem "${values.text('template')}"` : 'Mensagem pelo WhatsApp' }, ctx, { moveTo: values.optional('moveTo') });
    });
    closeModal();
    toast('WhatsApp aberto e contato registrado.');
  },
});

registerActions({
  'contact:new': (el) => openContactForm(el.dataset.id!, (el.dataset.direction as 'enviado' | 'recebido') ?? 'enviado', (el.dataset.channel as ContactChannel) ?? 'whatsapp'),
  'contact:remove': async (el) => {
    requirePermission('commercial:edit');
    await store().apply((draft) => removeContact(draft, el.dataset.opp!, el.dataset.id!));
    toast('Contato removido.');
  },
  'lost:ask': (el) => askLostReason([el.dataset.id!]),
  'whatsapp:open': (el) => openWhatsapp(el.dataset.id!),
  'whatsapp:template': (el) => {
    const select = el as HTMLSelectElement;
    const form = select.closest('form');
    const opp = findOpportunity(store().data, form?.dataset.id);
    const area = form?.querySelector<HTMLTextAreaElement>('textarea[name="message"]');
    const item = store().data.library.find((l) => l.id === select.value);
    if (!opp || !area) return;
    area.value = item ? fillTemplate(item.content, { company: opp.company, contact: opp.contactName, me: store().currentUser.shortName }) : '';
    const hidden = form?.querySelector<HTMLInputElement>('input[name="template"]');
    if (hidden) hidden.value = item?.title ?? '';
  },
});

// ---------------------------------------------------------------- Motivo de perda

export function askLostReason(ids: string[]): void {
  if (!ids.length) return;
  const { data } = store();
  const names = ids.map((id) => findOpportunity(data, id)?.company).filter(Boolean) as string[];
  openModal({
    title: ids.length === 1 ? `Por que ${names[0]} não fechou?` : `Por que estes ${ids.length} leads não fecharam?`,
    description: 'Leva 2 segundos e mostra, com o tempo, o que mais faz vocês perderem clientes.',
    body: html`
      <form class="form" data-form="lost:save" data-ids="${ids.join(',')}">
        ${selectField({ name: 'reason', label: 'Motivo', value: '', emptyLabel: 'Escolha o motivo', options: categoryNames(data, 'motivo_perda').map((r) => ({ value: r, label: r })) })}
        ${textField({ name: 'note', label: 'Detalhe (opcional)', placeholder: 'Ex.: achou caro, queria pagar só na entrega', autofocus: true })}
        <p class="muted small">${icon('info', 13)} Dá para criar outros motivos em <a href="#/categorias">Categorias</a>.</p>
        ${formActions('Salvar motivo')}
      </form>`,
  });
}

// ---------------------------------------------------------------- WhatsApp com mensagem pronta

function openWhatsapp(oppId: string): void {
  const { data, currentUser } = store();
  const opp = findOpportunity(data, oppId);
  if (!opp) return;
  const templates = data.library.filter((l) => l.category === 'mensagem');
  const hasPhone = Boolean(whatsappNumber(opp.contact.phone));
  const suggestion = suggestedStage(opp, 'enviado');
  const first = templates[0];
  openModal({
    title: `WhatsApp para ${opp.company}`,
    description: 'Escolha um modelo da Biblioteca, ajuste o texto e abra o WhatsApp. O contato fica registrado sozinho.',
    size: 'lg',
    body: html`
      <form class="form" data-form="whatsapp:send" data-id="${opp.id}">
        <input type="hidden" name="template" value="${first?.title ?? ''}" />
        <div class="form-grid">
          <div class="field">
            <label class="field__label" for="wa-template">Modelo de mensagem</label>
            <select id="wa-template" class="input select" data-change="whatsapp:template">
              <option value="">Mensagem em branco</option>
              ${templates.map((t, i) => html`<option value="${t.id}" ${i === 0 ? 'selected' : ''}>${t.title}</option>`)}
            </select>
          </div>
          ${textField({ name: 'phone', label: 'WhatsApp do lead', type: 'tel', value: opp.contact.phone ?? '', required: !hasPhone, placeholder: '(47) 99999-9999', hint: hasPhone ? undefined : 'Sem número cadastrado: digite aqui e ele fica salvo.' })}
        </div>
        ${textareaField({
          name: 'message',
          label: 'Mensagem',
          rows: 7,
          value: first ? fillTemplate(first.content, { company: opp.company, contact: opp.contactName, me: currentUser.shortName }) : '',
          hint: 'Nos modelos, {empresa}, {contato} e {meu_nome} são trocados sozinhos.',
        })}
        ${selectField({
          name: 'moveTo',
          label: 'Depois de enviar, mover para',
          value: suggestion,
          emptyLabel: `Manter em "${stageLabel(data, opp.stage)}"`,
          options: pipelineStages(data).filter((s) => s.id !== opp.stage).map((s) => ({ value: s.id, label: s.label })),
        })}
        ${templates.length ? '' : notice({ title: 'Nenhum modelo de mensagem ainda', text: html`Cadastre seus textos de abordagem em <a href="#/biblioteca">Biblioteca</a> (categoria "Mensagem comercial").` })}
        ${formActions('Abrir WhatsApp')}
      </form>`,
  });
}

// ---------------------------------------------------------------- Histórico de contatos (detalhe)

export function contactPanel(opp: Opportunity): SafeHtml {
  const { data } = store();
  const log = [...contactLog(opp)].sort((a, b) => b.date.localeCompare(a.date) || b.at.localeCompare(a.at));
  const edit = allowed('commercial:edit');
  return panel({
    title: 'Contatos',
    icon: 'chat',
    count: log.length,
    action: edit ? button({ label: 'Registrar', action: 'contact:new', icon: 'plus', variant: 'ghost', size: 'sm', data: { id: opp.id } }) : undefined,
    body: html`
      ${edit
        ? html`<div class="contact-actions">
            ${button({ label: 'WhatsApp', action: 'whatsapp:open', icon: 'chat', size: 'sm', variant: 'primary', data: { id: opp.id } })}
            ${button({ label: 'Liguei', action: 'contact:new', icon: 'phone', size: 'sm', data: { id: opp.id, channel: 'ligacao' } })}
            ${button({ label: 'Respondeu', action: 'contact:new', icon: 'check', size: 'sm', data: { id: opp.id, direction: 'recebido' } })}
          </div>`
        : ''}
      ${log.length
        ? html`<ul class="contact-log">${log.map(
            (c) => html`<li class="${cx('contact-log__item', c.direction === 'recebido' && 'is-reply')}">
              <span class="contact-log__icon">${icon(c.direction === 'recebido' ? 'arrowDown' : c.channel === 'ligacao' ? 'phone' : 'send', 13)}</span>
              <div>
                <p>${c.direction === 'recebido' ? 'Cliente respondeu' : channelLabel(c.channel)}${c.note ? html` · <span class="muted">${c.note}</span>` : ''}</p>
                <small>${formatShortDate(c.date)} · ${findUser(data, c.authorId)?.shortName ?? '—'}</small>
              </div>
              ${edit ? button({ label: 'Remover contato', iconOnly: true, icon: 'close', variant: 'ghost', size: 'sm', action: 'contact:remove', data: { opp: opp.id, id: c.id } }) : ''}
            </li>`,
          )}</ul>`
        : html`<p class="muted small">${opp.contactedAt ? `Contato feito em ${formatShortDate(opp.contactedAt)}${opp.repliedAt ? ` · respondeu em ${formatShortDate(opp.repliedAt)}` : ''}. Os próximos contatos aparecem aqui.` : 'Nenhum contato registrado ainda.'}</p>`}
    `,
  });
}

// ---------------------------------------------------------------- Relatórios

function bars(rows: Array<{ label: string; value: number; hint?: string }>, format: (n: number) => string = String): SafeHtml {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return html`<ul class="hbars">${rows.map(
    (r) => html`<li class="hbars__row">
      <span class="hbars__label">${r.label}</span>
      <span class="hbars__track"><span class="hbars__fill" style="width: ${Math.round((r.value / max) * 100)}%"></span></span>
      <span class="hbars__value">${format(r.value)}${r.hint ? html` <small>${r.hint}</small>` : ''}</span>
    </li>`,
  )}</ul>`;
}

function weekLabel(start: ISODate): string {
  return `${start.slice(8, 10)}/${start.slice(5, 7)}`;
}

export function renderReports(): SafeHtml {
  const { data } = store();
  const report = commercialReport(data, today());
  const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : '—');
  const maxWeek = Math.max(1, ...report.weekly.map((w) => Math.max(w.sent, w.replies)));
  return html`
    ${pageHeader({ title: 'Comercial', subtitle: 'Relatórios: o que funciona e onde vocês perdem clientes' })}
    ${commercialTabs('relatorios')}

    <div class="stats stats--compact">
      ${statCard({ label: 'Contatos nas últimas 8 semanas', value: String(report.weekly.reduce((s, w) => s + w.sent, 0)), hint: `${report.weekly.reduce((s, w) => s + w.replies, 0)} respostas` })}
      ${statCard({ label: 'Tempo médio até fechar', value: report.avgDaysToClose === null ? '—' : pluralize(Math.round(report.avgDaysToClose), 'dia', 'dias'), hint: 'Do cadastro até "Ganho"' })}
      ${statCard({ label: 'Tentativas até responder', value: report.avgAttemptsToReply === null ? '—' : report.avgAttemptsToReply.toLocaleString('pt-BR', { maximumFractionDigits: 1 }), hint: 'Média de contatos antes da 1ª resposta' })}
      ${statCard({ label: 'Leads que não fecharam', value: String(report.lostReasons.reduce((s, r) => s + r.count, 0) + report.lostWithoutReason), hint: report.lostWithoutReason ? `${report.lostWithoutReason} sem motivo anotado` : undefined })}
    </div>

    <div class="report-grid">
      ${panel({
        title: 'Contatos por semana',
        icon: 'chart',
        body: html`<div class="week-chart">${report.weekly.map(
          (w) => html`<div class="week-chart__col" title="${w.sent} contatos · ${w.replies} respostas">
            <span class="week-chart__bars">
              <span class="week-chart__bar" style="height: ${Math.round((w.sent / maxWeek) * 100)}%"></span>
              <span class="week-chart__bar week-chart__bar--reply" style="height: ${Math.round((w.replies / maxWeek) * 100)}%"></span>
            </span>
            <span class="week-chart__value">${w.sent}</span>
            <span class="week-chart__label">${weekLabel(w.weekStart)}</span>
          </div>`,
        )}</div>
        <p class="rev-chart__legend"><span><i class="legend-swatch legend-swatch--revenue"></i> Contatos enviados</span><span><i class="legend-swatch legend-swatch--reply"></i> Respostas</span></p>`,
      })}
      ${panel({
        title: 'Por que não fecham',
        icon: 'alert',
        body: report.lostReasons.length
          ? html`${bars(report.lostReasons.map((r) => ({ label: r.label, value: r.count })))}
              ${report.lostWithoutReason ? html`<p class="muted small">${pluralize(report.lostWithoutReason, 'lead perdido está', 'leads perdidos estão')} sem motivo. Abra o lead e clique em "Anotar motivo".</p>` : ''}`
          : emptyState({ icon: 'alert', compact: true, title: 'Nenhum motivo anotado ainda', text: 'Quando um lead for para a etapa final de perda, o sistema pergunta o motivo.' }),
      })}
      ${panel({
        title: 'Por origem',
        icon: 'route',
        body: report.bySource.length
          ? html`<div class="table-wrap"><table class="table table--compact">
              <thead><tr><th>Origem</th><th class="num">Leads</th><th class="num">Responderam</th><th class="num">Fecharam</th></tr></thead>
              <tbody>${report.bySource.map((r) => html`<tr><td>${r.label}</td><td class="num">${r.count}</td><td class="num">${r.replied} <small class="muted">${pct(r.replied, r.contacted)}</small></td><td class="num">${r.won} <small class="muted">${pct(r.won, r.count)}</small></td></tr>`)}</tbody>
            </table></div>`
          : emptyState({ icon: 'route', compact: true, title: 'Sem dados ainda' }),
      })}
      ${panel({
        title: 'Por nicho',
        icon: 'target',
        body: report.bySegment.length
          ? html`<div class="table-wrap"><table class="table table--compact">
              <thead><tr><th>Nicho</th><th class="num">Leads</th><th class="num">Responderam</th><th class="num">Fecharam</th></tr></thead>
              <tbody>${report.bySegment.slice(0, 12).map((r) => html`<tr><td>${r.label}</td><td class="num">${r.count}</td><td class="num">${r.replied} <small class="muted">${pct(r.replied, r.contacted)}</small></td><td class="num">${r.won} <small class="muted">${pct(r.won, r.count)}</small></td></tr>`)}</tbody>
            </table></div>`
          : emptyState({ icon: 'target', compact: true, title: 'Sem dados ainda' }),
      })}
    </div>
    <p class="muted small">${icon('info', 13)} Os números usam os contatos registrados em cada lead (botões WhatsApp, Liguei e Respondeu). ${allowed('finance:view') ? `Valor ganho total: ${formatCurrency(data.opportunities.filter((o) => o.stage === WON_STAGE).reduce((s, o) => s + (o.estimatedValue ?? 0), 0))}.` : ''}</p>
  `;
}
