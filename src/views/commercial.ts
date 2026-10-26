/** Comercial: funil por etapas, lista e detalhe das oportunidades. */
import { formatShortDate, formatTimestamp } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney, pluralize } from '../core/format.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import { navigate, type Route } from '../core/router.ts';
import { opportunityBriefing } from '../agents/context.ts';
import { LEAD_SOURCES, OPEN_STAGES, OPPORTUNITY_STAGES, labelOf, toneOf } from '../domain/labels.ts';
import {
  addOpportunityNote,
  convertOpportunityToClient,
  createOpportunity,
  deleteOpportunity,
  moveOpportunity,
  updateOpportunity,
  type OpportunityInput,
} from '../domain/operations.ts';
import { findOpportunity, findUser, opportunitiesByStage, pipelineSummary, tasksRelatedTo } from '../domain/selectors.ts';
import type { Opportunity, OpportunityStage } from '../domain/types.ts';
import { allowed, requirePermission, rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { avatar, badge, button, demoTag, dueDate, emptyState, pageHeader, panel, people, avatarStack, segmented, statCard } from '../ui/components.ts';
import { peopleField, readPeople } from '../ui/people-picker.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';
import { taskList, taskRow } from '../ui/task-row.ts';
import { setAgentDraft } from './agents.ts';

const ui = { mode: 'funil' as 'funil' | 'lista', owner: 'todos' };

function visibleOpportunities(list: Opportunity[]): Opportunity[] {
  return ui.owner === 'todos' ? list : list.filter((o) => o.ownerIds.includes(ui.owner));
}

// ---------------------------------------------------------------- Formulário

function openOpportunityForm(opp?: Opportunity, stage?: OpportunityStage): void {
  const { data, currentUser } = store();
  const financeEdit = allowed('finance:edit');
  const v: OpportunityInput = opp ?? {
    contactName: '', company: '', segment: '', source: 'Instagram', contact: {}, stage: stage ?? 'identificada',
    estimatedValue: null, nextAction: '', followUpDate: null, ownerIds: [currentUser.id], notes: '',
  };
  openModal({
    title: opp ? 'Editar oportunidade' : 'Nova oportunidade',
    size: 'lg',
    body: html`
      <form class="form" data-form="opportunity:save" data-id="${opp?.id ?? ''}">
        <div class="form-grid">
          ${textField({ name: 'company', label: 'Empresa', value: v.company, required: true, autofocus: true })}
          ${textField({ name: 'contactName', label: 'Nome do contato', value: v.contactName })}
          ${textField({ name: 'segment', label: 'Segmento', value: v.segment, placeholder: 'Ex.: Cafeteria, Saúde' })}
          ${selectField({ name: 'source', label: 'Origem', value: v.source, options: LEAD_SOURCES.map((s) => ({ value: s, label: s })) })}
          ${peopleField({ name: 'ownerIds', label: 'Responsáveis', data, value: v.ownerIds, className: 'span-2' })}
          ${textField({ name: 'email', label: 'E-mail', type: 'email', value: v.contact.email })}
          ${textField({ name: 'phone', label: 'Telefone / WhatsApp', type: 'tel', value: v.contact.phone })}
          ${textField({ name: 'instagram', label: 'Instagram', value: v.contact.instagram, placeholder: '@perfil' })}
          ${selectField({ name: 'stage', label: 'Etapa', value: v.stage, options: OPPORTUNITY_STAGES })}
          ${financeEdit
            ? textField({ name: 'estimatedValue', label: 'Valor estimado (R$)', value: v.estimatedValue ?? '', inputmode: 'decimal', placeholder: 'Deixe vazio se ainda não souber' })
            : html`<div></div>`}
          ${textField({ name: 'followUpDate', label: 'Data de acompanhamento', type: 'date', value: v.followUpDate ?? '' })}
          ${textField({ name: 'nextAction', label: 'Próxima ação', value: v.nextAction, className: 'span-2' })}
        </div>
        ${textareaField({ name: 'notes', label: 'Observações', value: v.notes, rows: 3 })}
        ${formActions(opp ? 'Salvar alterações' : 'Cadastrar oportunidade')}
      </form>
    `,
  });
}

registerForms({
  'opportunity:save': async (form, values) => {
    requirePermission('commercial:edit');
    const id = form.dataset.id;
    const input: OpportunityInput = {
      company: values.text('company'),
      contactName: values.text('contactName'),
      segment: values.text('segment'),
      source: values.text('source'),
      contact: {
        email: values.text('email') || undefined,
        phone: values.text('phone') || undefined,
        instagram: values.text('instagram') || undefined,
      },
      stage: values.text('stage') as OpportunityStage,
      estimatedValue: allowed('finance:edit') ? parseMoney(values.text('estimatedValue')) : (id ? findOpportunity(store().data, id)?.estimatedValue ?? null : null),
      nextAction: values.text('nextAction'),
      followUpDate: values.optional('followUpDate'),
      ownerIds: readPeople(values, 'ownerIds'),
      notes: values.text('notes'),
    };
    if (!input.company) throw new Error('Informe o nome da empresa.');
    if (id) {
      const previous = findOpportunity(store().data, id);
      await store().apply((draft, ctx) => updateOpportunity(draft, id, { ...input, contact: { ...previous?.contact, ...input.contact } }, ctx));
    } else {
      await store().apply((draft, ctx) => createOpportunity(draft, input, ctx));
    }
    closeModal();
    toast(id ? 'Oportunidade atualizada.' : 'Oportunidade cadastrada.');
  },
  'opportunity:note': async (form, values) => {
    requirePermission('commercial:edit');
    const text = values.text('note');
    if (!text) return;
    await store().apply((draft, ctx) => addOpportunityNote(draft, form.dataset.id!, text, ctx));
    toast('Registro adicionado ao histórico.');
  },
});

registerActions({
  'opportunity:new': (el) => openOpportunityForm(undefined, el.dataset.stage as OpportunityStage | undefined),
  'opportunity:edit': (el) => {
    const opp = findOpportunity(store().data, el.dataset.id);
    if (opp) openOpportunityForm(opp);
  },
  'opportunity:stage': async (el) => {
    requirePermission('commercial:edit');
    const stage = (el as HTMLSelectElement).value as OpportunityStage;
    await store().apply((draft, ctx) => moveOpportunity(draft, el.dataset.id!, stage, ctx));
    toast(`Movida para "${labelOf(OPPORTUNITY_STAGES, stage)}".`);
  },
  'opportunity:convert': async (el) => {
    requirePermission('commercial:edit');
    const client = await store().apply((draft, ctx) => convertOpportunityToClient(draft, el.dataset.id!, ctx));
    toast('Cliente criado a partir da oportunidade.');
    navigate(`/clientes/${client.id}`);
  },
  'opportunity:delete': async (el) => {
    const ok = await confirmAction({ title: 'Excluir oportunidade', text: 'A oportunidade e seu histórico serão removidos. Tarefas relacionadas serão mantidas, sem vínculo.', confirmLabel: 'Excluir' });
    if (!ok) return;
    await store().apply((draft) => deleteOpportunity(draft, el.dataset.id!));
    toast('Oportunidade excluída.');
    navigate('/comercial');
  },
  'opportunity:to-agent': (el) => {
    const opp = findOpportunity(store().data, el.dataset.id);
    if (!opp) return;
    setAgentDraft('comercial', opportunityBriefing(store().data, opp, allowed('finance:view')));
    navigate('/agentes/comercial');
  },
  'commercial:mode': (el) => {
    ui.mode = el.dataset.value as typeof ui.mode;
    rerender();
  },
  'commercial:owner': (el) => {
    ui.owner = el.dataset.value!;
    rerender();
  },
});

// ---------------------------------------------------------------- Arrastar e soltar no funil

let draggingId: string | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('dragstart', (event) => {
    const card = (event.target as HTMLElement).closest<HTMLElement>('[data-drag-opportunity]');
    if (!card) return;
    draggingId = card.dataset.dragOpportunity!;
    event.dataTransfer?.setData('text/plain', draggingId);
    card.classList.add('is-dragging');
  });
  document.addEventListener('dragend', () => {
    draggingId = null;
    document.querySelectorAll('.is-dragging, .is-drop-target').forEach((el) => el.classList.remove('is-dragging', 'is-drop-target'));
  });
  document.addEventListener('dragover', (event) => {
    const column = (event.target as HTMLElement).closest<HTMLElement>('[data-drop-stage]');
    if (!column || !draggingId) return;
    event.preventDefault();
    document.querySelectorAll('.is-drop-target').forEach((el) => el !== column && el.classList.remove('is-drop-target'));
    column.classList.add('is-drop-target');
  });
  document.addEventListener('drop', (event) => {
    const column = (event.target as HTMLElement).closest<HTMLElement>('[data-drop-stage]');
    if (!column || !draggingId) return;
    event.preventDefault();
    const id = draggingId;
    const stage = column.dataset.dropStage as OpportunityStage;
    if (findOpportunity(store().data, id)?.stage === stage || !allowed('commercial:edit')) return;
    void store().apply((draft, ctx) => moveOpportunity(draft, id, stage, ctx)).then(() =>
      toast(`Movida para "${labelOf(OPPORTUNITY_STAGES, stage)}".`),
    );
  });
}

// ---------------------------------------------------------------- Renderização

function opportunityCard(opp: Opportunity): SafeHtml {
  const { data } = store();
  const t = today();
  const finance = allowed('finance:view');
  const open = OPEN_STAGES.includes(opp.stage);
  return html`
    <article class="opp-card" draggable="true" data-drag-opportunity="${opp.id}">
      <a class="opp-card__link" href="#/comercial/${opp.id}">
        <span class="opp-card__head">
          <span class="opp-card__company">${opp.company}</span>
          ${avatarStack(data, opp.ownerIds)}
        </span>
        <span class="opp-card__sub">${[opp.segment, opp.source].filter(Boolean).join(' · ')} ${demoTag(opp)}</span>
        ${finance && opp.estimatedValue !== null ? html`<span class="opp-card__value">${formatCurrency(opp.estimatedValue)}</span>` : ''}
        ${open && opp.nextAction ? html`<span class="opp-card__next">${icon('arrowRight', 13)} ${opp.nextAction}</span>` : ''}
        ${open && opp.followUpDate ? dueDate(opp.followUpDate, t) : ''}
      </a>
    </article>
  `;
}

function renderBoard(list: Opportunity[]): SafeHtml {
  const finance = allowed('finance:view');
  return html`
    <div class="board" data-preserve-scroll="commercial-board">
      ${OPPORTUNITY_STAGES.map((stage) => {
        const items = opportunitiesByStage({ ...store().data, opportunities: list }, stage.value);
        const total = items.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0);
        return html`
          <section class="${cx('board__column', `board__column--${stage.tone}`)}" data-drop-stage="${stage.value}" aria-label="${stage.label}">
            <header class="board__header">
              <span class="board__title">${stage.label}</span>
              <span class="board__count">${items.length}</span>
            </header>
            ${finance && total ? html`<p class="board__total">${formatCurrency(total)}</p>` : ''}
            <div class="board__cards">
              ${items.length ? items.map(opportunityCard) : html`<p class="board__empty">Arraste uma oportunidade para cá</p>`}
            </div>
            ${OPEN_STAGES.includes(stage.value)
              ? html`<button type="button" class="board__add" data-action="opportunity:new" data-stage="${stage.value}">${icon('plus', 14)} Adicionar</button>`
              : ''}
          </section>`;
      })}
    </div>
  `;
}

function renderList(list: Opportunity[]): SafeHtml {
  const { data } = store();
  const t = today();
  const finance = allowed('finance:view');
  const sorted = [...list].sort((a, b) => OPPORTUNITY_STAGES.findIndex((s) => s.value === a.stage) - OPPORTUNITY_STAGES.findIndex((s) => s.value === b.stage));
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Empresa</th><th>Etapa</th><th>Responsável</th>${finance ? html`<th class="num">Valor</th>` : ''}<th>Próxima ação</th><th>Acompanhamento</th></tr></thead>
        <tbody>
          ${sorted.map(
            (o) => html`<tr>
              <td class="cell-main"><a href="#/comercial/${o.id}">${o.company}</a> ${demoTag(o)}<span class="cell-sub">${o.contactName} · ${o.segment}</span></td>
              <td data-label="Etapa">${badge(labelOf(OPPORTUNITY_STAGES, o.stage), toneOf(OPPORTUNITY_STAGES, o.stage))}</td>
              <td data-label="Responsável">${people(data, o.ownerIds)}</td>
              ${finance ? html`<td data-label="Valor" class="num">${o.estimatedValue === null ? html`<span class="muted">—</span>` : formatCurrency(o.estimatedValue)}</td>` : ''}
              <td data-label="Próxima ação">${o.nextAction || html`<span class="muted">—</span>`}</td>
              <td data-label="Acompanhamento">${OPEN_STAGES.includes(o.stage) ? dueDate(o.followUpDate, t) : html`<span class="muted">—</span>`}</td>
            </tr>`,
          )}
        </tbody>
      </table>
    </div>
  `;
}

function renderOverview(): SafeHtml {
  const { data } = store();
  const t = today();
  const finance = allowed('finance:view');
  const summary = pipelineSummary(data, t);
  const list = visibleOpportunities(data.opportunities);

  return html`
    ${pageHeader({
      title: 'Comercial',
      subtitle: `${pluralize(summary.openCount, 'oportunidade aberta', 'oportunidades abertas')} · ${pluralize(summary.followUpsDue, 'retorno pendente', 'retornos pendentes')}`,
      actions: button({ label: 'Nova oportunidade', action: 'opportunity:new', variant: 'primary', icon: 'plus' }),
    })}

    <div class="stats stats--compact">
      ${statCard({ label: 'Em aberto', value: String(summary.openCount) })}
      ${finance ? statCard({ label: 'Valor estimado em aberto', value: formatCurrency(summary.openValue), hint: summary.withoutValue ? `${summary.withoutValue} sem valor definido` : undefined }) : ''}
      ${statCard({ label: 'Ganhas', value: String(summary.wonCount), hint: finance && summary.wonValue ? formatCurrency(summary.wonValue) : undefined, tone: 'success' })}
      ${statCard({ label: 'Retornos para hoje ou vencidos', value: String(summary.followUpsDue), tone: summary.followUpsDue ? 'warning' : undefined })}
    </div>

    <div class="toolbar">
      ${segmented({ label: 'Visualização', action: 'commercial:mode', value: ui.mode, items: [{ value: 'funil', label: 'Funil', icon: 'kanban' }, { value: 'lista', label: 'Lista', icon: 'list' }] })}
      ${segmented({ label: 'Responsável', action: 'commercial:owner', value: ui.owner, items: [{ value: 'todos', label: 'Todos' }, ...data.users.map((u) => ({ value: u.id, label: u.shortName }))] })}
    </div>

    ${data.opportunities.length === 0
      ? html`<div class="panel">${emptyState({
          icon: 'commercial',
          title: 'Nenhuma oportunidade cadastrada',
          text: 'Registre potenciais clientes para acompanhar cada etapa do funil, da identificação ao fechamento.',
          action: button({ label: 'Nova oportunidade', action: 'opportunity:new', variant: 'primary', icon: 'plus' }),
        })}</div>`
      : ui.mode === 'funil'
        ? renderBoard(list)
        : list.length
          ? renderList(list)
          : html`<div class="panel">${emptyState({ icon: 'commercial', title: 'Nenhuma oportunidade para este responsável' })}</div>`}
  `;
}

function infoItem(label: string, value: SafeHtml | string | null | undefined): SafeHtml {
  return html`<div class="info__item"><dt>${label}</dt><dd>${value || html`<span class="muted">—</span>`}</dd></div>`;
}

function renderDetail(opp: Opportunity): SafeHtml {
  const { data } = store();
  const t = today();
  const finance = allowed('finance:view');
  const tasks = tasksRelatedTo(data, { type: 'opportunity', id: opp.id });
  const open = OPEN_STAGES.includes(opp.stage);

  return html`
    ${pageHeader({
      title: opp.company,
      back: { href: '#/comercial', label: 'Comercial' },
      subtitle: html`${badge(labelOf(OPPORTUNITY_STAGES, opp.stage), toneOf(OPPORTUNITY_STAGES, opp.stage))} ${demoTag(opp)} <span class="muted">${opp.segment}</span>`,
      actions: html`
        ${button({ label: 'Preparar para o agente comercial', action: 'opportunity:to-agent', icon: 'agents', data: { id: opp.id } })}
        ${button({ label: 'Editar', action: 'opportunity:edit', icon: 'edit', data: { id: opp.id } })}
      `,
    })}

    <div class="detail-grid">
      <div class="detail-grid__main">
        ${panel({
          title: 'Dados da oportunidade',
          body: html`
            <dl class="info">
              ${infoItem('Contato', opp.contactName)}
              ${infoItem('Origem', opp.source)}
              ${infoItem('E-mail', opp.contact.email)}
              ${infoItem('Telefone', opp.contact.phone)}
              ${infoItem('Instagram', opp.contact.instagram)}
              ${infoItem(opp.ownerIds.length > 1 ? 'Responsáveis' : 'Responsável', people(data, opp.ownerIds))}
              ${finance ? infoItem('Valor estimado', opp.estimatedValue === null ? 'Ainda não definido' : formatCurrency(opp.estimatedValue)) : ''}
              ${infoItem('Cadastrada em', formatShortDate(opp.createdAt.slice(0, 10)))}
            </dl>
            ${opp.notes ? html`<div class="note-block"><h3>Observações</h3><p>${multiline(opp.notes)}</p></div>` : ''}
          `,
        })}

        ${panel({
          title: 'Tarefas relacionadas',
          icon: 'tasks',
          count: tasks.length,
          action: button({ label: 'Nova tarefa', action: 'task:new', variant: 'ghost', icon: 'plus', size: 'sm', data: { related: `opportunity:${opp.id}` } }),
          body: tasks.length ? taskList(tasks.map((task) => taskRow(data, task, t, { showRelated: false }))) : emptyState({ icon: 'tasks', compact: true, title: 'Nenhuma tarefa ligada a esta oportunidade' }),
        })}

        ${panel({
          title: 'Histórico',
          icon: 'clock',
          body: html`
            <form class="inline-form" data-form="opportunity:note" data-id="${opp.id}">
              <label class="visually-hidden" for="opp-note">Novo registro</label>
              <input id="opp-note" class="input" name="note" placeholder="Registrar contato, resposta ou observação" autocomplete="off" />
              <button class="btn btn--secondary" type="submit">Registrar</button>
            </form>
            ${opp.history.length
              ? html`<ol class="history">${[...opp.history].reverse().map(
                  (h) => html`<li class="history__item">
                    ${avatar(findUser(data, h.authorId))}
                    <div><p>${h.text}</p><small>${findUser(data, h.authorId)?.shortName ?? '—'} · ${formatTimestamp(h.at)}</small></div>
                  </li>`,
                )}</ol>`
              : emptyState({ icon: 'clock', compact: true, title: 'Sem registros ainda' })}
          `,
        })}
      </div>

      <aside class="detail-grid__side">
        ${panel({
          title: 'Andamento',
          body: html`
            <div class="field">
              <label class="field__label" for="opp-stage">Etapa do funil</label>
              <select id="opp-stage" class="input select" data-change="opportunity:stage" data-id="${opp.id}">
                ${OPPORTUNITY_STAGES.map((s) => html`<option value="${s.value}" ${s.value === opp.stage ? 'selected' : ''}>${s.label}</option>`)}
              </select>
            </div>
            ${open
              ? html`<div class="next-action">
                  <span class="next-action__label">Próxima ação</span>
                  <p>${opp.nextAction || 'Não definida'}</p>
                  ${dueDate(opp.followUpDate, t)}
                </div>`
              : ''}
            ${opp.clientId
              ? html`<a class="btn btn--secondary btn--block" href="#/clientes/${opp.clientId}">${icon('clients', 16)} Ver cliente</a>`
              : opp.stage === 'ganho' || opp.stage === 'negociacao'
                ? button({ label: opp.stage === 'ganho' ? 'Converter em cliente' : 'Marcar como ganha e criar cliente', action: 'opportunity:convert', icon: 'check', data: { id: opp.id }, variant: opp.stage === 'ganho' ? 'primary' : 'secondary' })
                : ''}
          `,
        })}
        <div class="danger-zone">
          ${button({ label: 'Excluir oportunidade', action: 'opportunity:delete', variant: 'ghost', icon: 'trash', size: 'sm', data: { id: opp.id } })}
        </div>
      </aside>
    </div>
  `;
}

export const commercialView: View = {
  title: (route: Route) => findOpportunity(store().data, route.params[0])?.company ?? 'Comercial',
  render: (route: Route) => {
    if (route.params[0]) {
      const opp = findOpportunity(store().data, route.params[0]);
      if (opp) return renderDetail(opp);
      return html`${pageHeader({ title: 'Oportunidade não encontrada', back: { href: '#/comercial', label: 'Comercial' } })}
        <div class="panel">${emptyState({ icon: 'commercial', title: 'Esta oportunidade não existe ou foi excluída.' })}</div>`;
    }
    return renderOverview();
  },
};
