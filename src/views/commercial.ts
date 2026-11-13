/** Comercial: funil por etapas, lista e detalhe das oportunidades. */
import { formatShortDate, formatTimestamp } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, normalizeText, parseMoney, pluralize } from '../core/format.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import { navigate, type Route } from '../core/router.ts';
import { opportunityBriefing } from '../agents/context.ts';
import { LOST_STAGE, STAGE_TONES, WON_STAGE, isOpenStage, openStages, pipelineStages, stageLabel, stageOptions, stageTone } from '../domain/labels.ts';
import { goalsFor } from '../domain/business.ts';
import { categoryNames } from '../domain/categories.ts';
import {
  COMMERCIAL_PERIODS,
  DEFAULT_FOLLOW_UP_DAYS,
  STAGE_KINDS,
  attemptsWithoutReply,
  clearFollowUp,
  commercialMetrics,
  followStatus,
  setStageBehavior,
  stageKind,
  type CommercialPeriod,
} from '../domain/commercial.ts';
import {
  addOpportunityNote,
  addPipelineStage,
  movePipelineStage,
  removePipelineStage,
  updatePipelineStage,
  convertOpportunityToClient,
  createOpportunity,
  deleteOpportunity,
  deleteOpportunities,
  moveOpportunity,
  updateOpportunity,
  type OpportunityInput,
} from '../domain/operations.ts';
import { findOpportunity, findUser, opportunitiesByStage, pipelineSummary, tasksRelatedTo } from '../domain/selectors.ts';
import type { Opportunity, OpportunityStage, StageKind, Tone } from '../domain/types.ts';
import { allowed, requirePermission, rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { avatar, badge, button, demoTag, emptyState, pageHeader, panel, people, avatarStack, progressBar, segmented } from '../ui/components.ts';
import { askLostReason, contactPanel, renderReports } from './commercial-extras.ts';
import { peopleField, readPeople } from '../ui/people-picker.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';
import { taskList, taskRow } from '../ui/task-row.ts';
import { setAgentDraft } from './agents.ts';
import { commercialTabs, openProposalForm, proposalsOfOpportunity, renderProposalDetail, renderProposals } from './proposals.ts';
import { findProposal } from './proposals.ts';

const ui = {
  mode: 'funil' as 'funil' | 'lista',
  period: 'mes' as CommercialPeriod,
  /** Filtro rápido pelos cards do topo. */
  focus: '' as '' | 'acao' | 'aguardando' | 'pausados',
  owner: 'todos',
  search: '',
  /** Modo de seleção: permite excluir ou mover várias oportunidades de uma vez. */
  selecting: false,
  selected: new Set<string>(),
};

function visibleOpportunities(list: Opportunity[]): Opportunity[] {
  let result = ui.owner === 'todos' ? list : list.filter((o) => o.ownerIds.includes(ui.owner));
  if (ui.focus) {
    const data = store().data;
    const t = today();
    result = result.filter((o) => {
      if (ui.focus === 'acao') return followStatus(data, o, t).needsAction;
      const kind = stageKind(data, o.stage);
      return ui.focus === 'aguardando' ? kind === 'vez_cliente' : kind === 'pausado';
    });
  }
  const term = normalizeText(ui.search.trim());
  if (term) {
    result = result.filter((o) => normalizeText([o.company, o.contactName, o.segment, o.source, o.contact.instagram ?? '', o.contact.phone ?? ''].join(' ')).includes(term));
  }
  return result;
}

function stopSelecting(): void {
  ui.selecting = false;
  ui.selected.clear();
}

async function deleteSelected(ids: string[]): Promise<void> {
  if (!ids.length) return;
  requirePermission('commercial:edit');
  const names = ids.map((id) => findOpportunity(store().data, id)?.company).filter(Boolean) as string[];
  const preview = names.slice(0, 4).join(', ') + (names.length > 4 ? ` e mais ${names.length - 4}` : '');
  const ok = await confirmAction({
    title: ids.length === 1 ? 'Excluir oportunidade' : `Excluir ${ids.length} oportunidades`,
    text: `${preview}. Elas saem do funil de vez. Tarefas ligadas a elas continuam, só sem o vínculo.`,
    confirmLabel: 'Excluir',
  });
  if (!ok) return;
  const removed = await store().apply((draft) => deleteOpportunities(draft, ids));
  stopSelecting();
  rerender();
  toast(removed === 1 ? 'Oportunidade excluída.' : `${removed} oportunidades excluídas.`);
}

// ---------------------------------------------------------------- Formulário

function openOpportunityForm(opp?: Opportunity, stage?: OpportunityStage): void {
  const { data, currentUser } = store();
  const financeEdit = allowed('finance:edit');
  const v: OpportunityInput = opp ?? {
    contactName: '', company: '', segment: '', source: categoryNames(data, 'origem')[0] ?? 'Instagram', contact: {}, stage: stage ?? openStages(data)[0],
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
          ${textField({ name: 'segment', label: 'Nicho', value: v.segment, placeholder: 'Ex.: Hamburgueria', suggestions: categoryNames(data, 'segmento') })}
          ${selectField({ name: 'source', label: 'Origem', value: v.source, options: categoryNames(data, 'origem', v.source).map((s) => ({ value: s, label: s })) })}
          ${peopleField({ name: 'ownerIds', label: 'Responsáveis', data, value: v.ownerIds, className: 'span-2' })}
          ${textField({ name: 'email', label: 'E-mail', type: 'email', value: v.contact.email })}
          ${textField({ name: 'phone', label: 'Telefone / WhatsApp', type: 'tel', value: v.contact.phone })}
          ${textField({ name: 'instagram', label: 'Instagram', value: v.contact.instagram, placeholder: '@perfil' })}
          ${selectField({ name: 'stage', label: 'Etapa', value: v.stage, options: stageOptions(data) })}
          ${financeEdit
            ? textField({ name: 'estimatedValue', label: 'Valor estimado (R$)', value: v.estimatedValue ?? '', inputmode: 'decimal', placeholder: 'Deixe vazio se ainda não souber' })
            : html`<div></div>`}
          ${textField({ name: 'followUpDate', label: 'Lembrete / próxima ação', type: 'date', value: v.followUpDate ?? '', hint: 'Só vira "pendente" em etapas que dependem de vocês.' })}
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
      closeModal();
      toast('Oportunidade atualizada.');
      if (input.stage === LOST_STAGE && previous?.stage !== LOST_STAGE) askLostReason([id]);
    } else {
      await store().apply((draft, ctx) => createOpportunity(draft, input, ctx));
      closeModal();
      toast('Oportunidade cadastrada.');
    }
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
    toast(`Movida para "${stageLabel(store().data, stage)}".`);
    if (stage === LOST_STAGE) askLostReason([el.dataset.id!]);
  },
  'opportunity:clear-followup': async (el) => {
    requirePermission('commercial:edit');
    await store().apply((draft) => clearFollowUp(draft, el.dataset.id!));
    toast('Lembrete removido.');
  },
  'commercial:period': (el) => {
    ui.period = el.dataset.value as CommercialPeriod;
    rerender();
  },
  'commercial:focus': (el) => {
    const value = el.dataset.value as typeof ui.focus;
    ui.focus = ui.focus === value ? '' : value;
    rerender();
  },
  'stage:kind': async (el) => {
    requirePermission('commercial:edit');
    await store().apply((draft) => setStageBehavior(draft, el.dataset.id!, { kind: (el as HTMLSelectElement).value as StageKind }));
    openStagesModal();
  },
  'stage:days': async (el) => {
    requirePermission('commercial:edit');
    const value = Number((el as HTMLInputElement).value);
    await store().apply((draft) => setStageBehavior(draft, el.dataset.id!, { followUpDays: Number.isFinite(value) ? Math.round(value) : 0 }));
    toast(value > 0 ? `Follow-up sugerido depois de ${value} ${value === 1 ? 'dia' : 'dias'} sem resposta.` : 'Esta etapa não sugere follow-up.');
  },
  'opportunity:proposal': (el) => openProposalForm(undefined, { opportunityId: el.dataset.id }),
  'commercial:stages': () => openStagesModal(),
  'stage:up': async (el) => {
    requirePermission('commercial:edit');
    await store().apply((draft) => movePipelineStage(draft, el.dataset.id!, -1));
    openStagesModal();
  },
  'stage:down': async (el) => {
    requirePermission('commercial:edit');
    await store().apply((draft) => movePipelineStage(draft, el.dataset.id!, 1));
    openStagesModal();
  },
  'stage:rename': async (el) => {
    requirePermission('commercial:edit');
    const input = el as HTMLInputElement;
    const stage = pipelineStages(store().data).find((s) => s.id === input.dataset.id);
    if (!stage || stage.label === input.value.trim()) return;
    try {
      await store().apply((draft) => updatePipelineStage(draft, input.dataset.id!, { label: input.value }));
      toast('Etapa renomeada.');
      // Redesenha a janela (botões usam o nome novo) sem tirar o cursor de onde a pessoa está.
      const focused = (document.activeElement as HTMLElement | null)?.id;
      openStagesModal();
      if (focused) document.getElementById(focused)?.focus();
    } catch (error) {
      input.value = stage.label;
      throw error;
    }
  },
  'stage:tone': async (el) => {
    requirePermission('commercial:edit');
    const tone = (el as HTMLSelectElement).value as Tone;
    await store().apply((draft) => updatePipelineStage(draft, el.dataset.id!, { tone }));
    openStagesModal();
  },
  'stage:remove': async (el) => {
    requirePermission('commercial:edit');
    const id = el.dataset.id!;
    const count = store().data.opportunities.filter((o) => o.stage === id).length;
    if (count) return openRemoveStage(id);
    const ok = await confirmAction({ title: 'Remover etapa', text: `A etapa "${stageLabel(store().data, id)}" está vazia e será removida do funil.`, confirmLabel: 'Remover etapa' });
    if (!ok) return openStagesModal();
    await store().apply((draft, ctx) => removePipelineStage(draft, id, null, ctx));
    toast('Etapa removida.');
    openStagesModal();
  },
  'stage:back': () => openStagesModal(),
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
  'opportunity:quick-delete': (el) => deleteSelected([el.dataset.id!]),
  'commercial:select': () => {
    if (ui.selecting) stopSelecting();
    else ui.selecting = true;
    rerender();
  },
  'opportunity:pick': (el) => {
    const id = el.dataset.id!;
    if (ui.selected.has(id)) ui.selected.delete(id);
    else ui.selected.add(id);
    rerender();
  },
  'commercial:pick-stage': (el) => {
    const ids = visibleOpportunities(store().data.opportunities).filter((o) => o.stage === el.dataset.stage).map((o) => o.id);
    const allPicked = ids.every((id) => ui.selected.has(id));
    for (const id of ids) {
      if (allPicked) ui.selected.delete(id);
      else ui.selected.add(id);
    }
    rerender();
  },
  'commercial:pick-all': () => {
    const ids = visibleOpportunities(store().data.opportunities).map((o) => o.id);
    const allPicked = ids.length > 0 && ids.every((id) => ui.selected.has(id));
    ui.selected.clear();
    if (!allPicked) ids.forEach((id) => ui.selected.add(id));
    rerender();
  },
  'commercial:bulk-delete': () => deleteSelected([...ui.selected]),
  'commercial:bulk-move': async (el) => {
    const stage = (el as HTMLSelectElement).value as OpportunityStage;
    if (!stage || !ui.selected.size) return;
    requirePermission('commercial:edit');
    const ids = [...ui.selected];
    await store().apply((draft, ctx) => ids.forEach((id) => moveOpportunity(draft, id, stage, ctx)));
    stopSelecting();
    rerender();
    toast(`${pluralize(ids.length, 'oportunidade movida', 'oportunidades movidas')} para "${stageLabel(store().data, stage)}".`);
    if (stage === LOST_STAGE) askLostReason(ids);
  },
  'commercial:search': (el) => {
    ui.search = (el as HTMLInputElement).value;
    rerender();
  },
  'commercial:clear-search': () => {
    ui.search = '';
    rerender();
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
    void store().apply((draft, ctx) => moveOpportunity(draft, id, stage, ctx)).then(() => {
      toast(`Movida para "${stageLabel(store().data, stage)}".`);
      if (stage === LOST_STAGE) askLostReason([id]);
    });
  });
}

// ---------------------------------------------------------------- Renderização

/** Situação do lead em uma linha: pendente, hora do follow-up, aguardando há X dias... */
function followChip(opp: Opportunity, t: string): SafeHtml {
  const status = followStatus(store().data, opp, t);
  if (!status.label) return html``;
  const iconName = status.state === 'follow_up' || status.state === 'lembrete' ? 'send' : status.state === 'aguardando' || status.state === 'sem_resposta' ? 'clock' : 'calendar';
  return html`<span class="${cx('follow', `follow--${status.tone}`, status.needsAction && 'is-action')}">${icon(iconName, 13)} ${status.label}</span>`;
}

function opportunityCard(opp: Opportunity): SafeHtml {
  const { data } = store();
  const t = today();
  const finance = allowed('finance:view');
  const open = isOpenStage(opp.stage);
  const content = html`
    <span class="opp-card__head">
      <span class="opp-card__company">${opp.company}</span>
      ${avatarStack(data, opp.ownerIds)}
    </span>
    <span class="opp-card__sub">${[opp.segment, opp.source].filter(Boolean).join(' · ')} ${demoTag(opp)}</span>
    ${finance && opp.estimatedValue !== null ? html`<span class="opp-card__value">${formatCurrency(opp.estimatedValue)}</span>` : ''}
    ${open && opp.nextAction ? html`<span class="opp-card__next">${icon('arrowRight', 13)} ${opp.nextAction}</span>` : ''}
    ${open ? followChip(opp, t) : opp.stage === LOST_STAGE && opp.lostReason ? html`<span class="follow follow--neutral">${opp.lostReason}</span>` : ''}`;

  if (ui.selecting) {
    const picked = ui.selected.has(opp.id);
    return html`
      <article class="${cx('opp-card', 'opp-card--pick', picked && 'is-picked')}">
        <button type="button" class="opp-card__link" data-action="opportunity:pick" data-id="${opp.id}" aria-pressed="${picked ? 'true' : 'false'}">
          <span class="opp-card__check" aria-hidden="true">${picked ? icon('check', 12) : ''}</span>
          ${content}
        </button>
      </article>`;
  }
  return html`
    <article class="opp-card" draggable="true" data-drag-opportunity="${opp.id}">
      <a class="opp-card__link" href="#/comercial/${opp.id}">${content}</a>
      ${allowed('commercial:edit')
        ? html`<span class="opp-card__tools">
            ${open ? html`<button type="button" class="opp-card__tool" data-action="contact:new" data-id="${opp.id}" title="Registrar contato" aria-label="Registrar contato com ${opp.company}">${icon('chat', 14)}</button>` : ''}
            <button type="button" class="opp-card__tool opp-card__delete" data-action="opportunity:quick-delete" data-id="${opp.id}" title="Excluir" aria-label="Excluir ${opp.company}">${icon('trash', 14)}</button>
          </span>`
        : ''}
    </article>
  `;
}

function renderBoard(list: Opportunity[]): SafeHtml {
  const finance = allowed('finance:view');
  return html`
    <div class="board" data-preserve-scroll="commercial-board">
      ${pipelineStages(store().data).map((stage) => {
        const items = opportunitiesByStage({ ...store().data, opportunities: list }, stage.id);
        const total = items.reduce((sum, o) => sum + (o.estimatedValue ?? 0), 0);
        return html`
          <section class="${cx('board__column', `board__column--${stage.tone}`)}" data-drop-stage="${stage.id}" aria-label="${stage.label}">
            <header class="board__header">
              <span class="board__title">${stage.label}</span>
              ${ui.selecting && items.length
                ? html`<button type="button" class="board__pick" data-action="commercial:pick-stage" data-stage="${stage.id}">${items.every((o) => ui.selected.has(o.id)) ? 'Desmarcar' : 'Marcar todas'}</button>`
                : ''}
              <span class="board__count">${items.length}</span>
            </header>
            ${finance && total ? html`<p class="board__total">${formatCurrency(total)}</p>` : ''}
            <div class="board__cards">
              ${items.length ? items.map(opportunityCard) : html`<p class="board__empty">Arraste uma oportunidade para cá</p>`}
            </div>
            ${isOpenStage(stage.id) && !ui.selecting
              ? html`<button type="button" class="board__add" data-action="opportunity:new" data-stage="${stage.id}">${icon('plus', 14)} Adicionar</button>`
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
  const order = pipelineStages(data).map((s) => s.id);
  const sorted = [...list].sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  const edit = allowed('commercial:edit');
  return html`
    <div class="table-wrap">
      <table class="table">
        <thead><tr>${ui.selecting ? html`<th class="cell-pick"><span class="visually-hidden">Selecionar</span></th>` : ''}<th>Empresa</th><th>Etapa</th><th>Responsável</th>${finance ? html`<th class="num">Valor</th>` : ''}<th>Próxima ação</th><th>Situação</th>${ui.selecting || !edit ? '' : html`<th class="cell-actions"><span class="visually-hidden">Ações</span></th>`}</tr></thead>
        <tbody>
          ${sorted.map(
            (o) => html`<tr class="${cx(ui.selected.has(o.id) && 'is-picked')}">
              ${ui.selecting
                ? html`<td class="cell-pick"><input type="checkbox" class="check" data-change="opportunity:pick" data-id="${o.id}" ${ui.selected.has(o.id) ? 'checked' : ''} aria-label="Selecionar ${o.company}" /></td>`
                : ''}
              <td class="cell-main"><a href="#/comercial/${o.id}">${o.company}</a> ${demoTag(o)}<span class="cell-sub">${[o.contactName, o.segment].filter(Boolean).join(' · ')}</span></td>
              <td data-label="Etapa">${badge(stageLabel(data, o.stage), stageTone(data, o.stage))}</td>
              <td data-label="Responsável">${people(data, o.ownerIds)}</td>
              ${finance ? html`<td data-label="Valor" class="num">${o.estimatedValue === null ? html`<span class="muted">—</span>` : formatCurrency(o.estimatedValue)}</td>` : ''}
              <td data-label="Próxima ação">${o.nextAction || html`<span class="muted">—</span>`}</td>
              <td data-label="Situação">${isOpenStage(o.stage) ? followChip(o, t) : o.lostReason ? html`<span class="muted">${o.lostReason}</span>` : html`<span class="muted">—</span>`}</td>
              ${ui.selecting || !edit
                ? ''
                : html`<td class="cell-actions"><button type="button" class="btn btn--ghost btn--icon btn--sm" data-action="opportunity:quick-delete" data-id="${o.id}" title="Excluir" aria-label="Excluir ${o.company}">${icon('trash', 15)}</button></td>`}
            </tr>`,
          )}
        </tbody>
      </table>
    </div>
  `;
}

function renderSelectionBar(list: Opportunity[]): SafeHtml {
  const { data } = store();
  const count = ui.selected.size;
  const allPicked = list.length > 0 && list.every((o) => ui.selected.has(o.id));
  return html`
    <div class="bulk-bar" role="region" aria-label="Ações para as oportunidades selecionadas">
      <span class="bulk-bar__count"><strong>${String(count)}</strong> ${count === 1 ? 'selecionada' : 'selecionadas'}</span>
      <button type="button" class="btn btn--ghost btn--sm" data-action="commercial:pick-all">${allPicked ? 'Desmarcar todas' : `Marcar todas (${list.length})`}</button>
      <span class="bulk-bar__spacer"></span>
      <label class="visually-hidden" for="bulk-move">Mover selecionadas para</label>
      <select id="bulk-move" class="input select bulk-bar__move" data-change="commercial:bulk-move" ${count ? '' : 'disabled'}>
        <option value="">Mover para…</option>
        ${pipelineStages(data).map((st) => html`<option value="${st.id}">${st.label}</option>`)}
      </select>
      <button type="button" class="btn btn--danger btn--sm" data-action="commercial:bulk-delete" ${count ? '' : 'disabled'}>${icon('trash', 15)}<span>Excluir</span></button>
    </div>`;
}

/** Meta diária de prospecção: contatos enviados hoje × meta. */
function dailyGoal(sentToday: number): SafeHtml {
  const { data } = store();
  const goal = goalsFor(data, today().slice(0, 7)).goals.dailyContacts ?? null;
  if (!goal) {
    return allowed('finance:edit')
      ? html`<p class="daily-goal daily-goal--empty">${icon('target', 14)} Hoje: <strong>${sentToday}</strong> ${sentToday === 1 ? 'contato' : 'contatos'} · <button type="button" class="link-button" data-action="goals:edit">definir meta diária</button></p>`
      : html``;
  }
  const pct = Math.min(100, Math.round((sentToday / goal) * 100));
  return html`<div class="${cx('daily-goal', sentToday >= goal && 'is-done')}">
    <span class="daily-goal__label">${icon('target', 14)} Meta de hoje: <strong>${sentToday} de ${goal}</strong> contatos</span>
    ${progressBar(pct, 'Meta diária de contatos')}
    <span class="daily-goal__hint">${sentToday >= goal ? 'Meta batida!' : `Faltam ${goal - sentToday}`}</span>
  </div>`;
}

function renderOverview(): SafeHtml {
  const { data } = store();
  const t = today();
  const finance = allowed('finance:view');
  const summary = pipelineSummary(data, t);
  const list = visibleOpportunities(data.opportunities);
  const owner = ui.owner === 'todos' ? undefined : ui.owner;
  const m = commercialMetrics(data, ui.period, t, owner);
  const periodText = COMMERCIAL_PERIODS.find((p) => p.value === ui.period)?.label.toLowerCase() ?? '';

  return html`
    ${pageHeader({
      title: 'Comercial',
      subtitle: `${pluralize(m.active, 'lead ativo', 'leads ativos')} · ${summary.followUpsDue ? pluralize(summary.followUpsDue, 'pede ação hoje', 'pedem ação hoje') : 'nada pendente por hoje'}`,
      actions: html`${button({ label: 'Etapas do funil', action: 'commercial:stages', icon: 'settings' })}${button({ label: 'Nova oportunidade', action: 'opportunity:new', variant: 'primary', icon: 'plus' })}`,
    })}
    ${commercialTabs('oportunidades')}

    <div class="cmetrics-head">
      ${segmented({ label: 'Período dos números', action: 'commercial:period', value: ui.period, items: COMMERCIAL_PERIODS })}
      ${dailyGoal(m.sentToday)}
    </div>
    <div class="cmetrics">
      ${metric({ label: 'Para agir hoje', value: m.actionToday, hint: m.actionToday ? 'Dependem de vocês' : 'Tudo em dia', tone: m.actionToday ? 'warning' : 'success', focus: 'acao', iconName: 'flag' })}
      ${metric({ label: 'Leads ativos', value: m.active, hint: m.paused ? `+ ${m.paused} para depois` : 'Em negociação', focus: '', iconName: 'commercial' })}
      ${metric({ label: 'Aguardando cliente', value: m.waiting, hint: 'Vocês já fizeram a parte de vocês', focus: 'aguardando', iconName: 'clock' })}
      ${metric({ label: 'Mensagens enviadas', value: m.sent, hint: `${pluralize(m.contacted, 'lead contatado', 'leads contatados')} · ${periodText}`, iconName: 'send' })}
      ${metric({ label: 'Taxa de resposta', value: m.replyRate === null ? '—' : `${Math.round(m.replyRate)}%`, hint: m.contacted ? `${m.replied} de ${m.contacted} responderam` : 'Sem contatos no período', iconName: 'chat' })}
      ${metric({ label: 'Fechados', value: m.won, hint: finance && m.wonValue ? `${formatCurrency(m.wonValue)} · ${periodText}` : m.lost ? `${m.lost} não fecharam · ${periodText}` : periodText, tone: m.won ? 'success' : undefined, iconName: 'check' })}
    </div>
    ${finance && summary.openValue ? html`<p class="muted small cmetrics-foot">${icon('money', 13)} Valor estimado em aberto: <strong>${formatCurrency(summary.openValue)}</strong>${summary.withoutValue ? ` · ${summary.withoutValue} sem valor definido` : ''}</p>` : ''}
    ${ui.focus ? html`<p class="filter-chip">Mostrando só: <strong>${ui.focus === 'acao' ? 'para agir hoje' : ui.focus === 'aguardando' ? 'aguardando o cliente' : 'para depois'}</strong> <button type="button" class="link-button" data-action="commercial:focus" data-value="${ui.focus}">mostrar todos</button></p>` : ''}

    <div class="toolbar">
      ${segmented({ label: 'Visualização', action: 'commercial:mode', value: ui.mode, items: [{ value: 'funil', label: 'Funil', icon: 'kanban' }, { value: 'lista', label: 'Lista', icon: 'list' }] })}
      ${segmented({ label: 'Responsável', action: 'commercial:owner', value: ui.owner, items: [{ value: 'todos', label: 'Todos' }, ...data.users.map((u) => ({ value: u.id, label: u.shortName }))] })}
      <label class="search">
        <span class="visually-hidden">Buscar oportunidades</span>
        <input id="commercial-search" class="input" type="search" placeholder="Buscar empresa, contato ou segmento" value="${ui.search}" data-input="commercial:search" />
      </label>
      ${allowed('commercial:edit') && data.opportunities.length
        ? button({ label: ui.selecting ? 'Cancelar seleção' : 'Selecionar várias', action: 'commercial:select', icon: ui.selecting ? 'close' : 'check', variant: ui.selecting ? 'secondary' : 'ghost' })
        : ''}
    </div>
    ${ui.selecting ? renderSelectionBar(list) : ''}

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

function metric(options: { label: string; value: number | string; hint: string; tone?: Tone; focus?: typeof ui.focus; iconName: Parameters<typeof icon>[0] }): SafeHtml {
  const inner = html`
    <span class="cmetric__top"><span class="cmetric__icon">${icon(options.iconName, 15)}</span>${options.label}</span>
    <span class="cmetric__value">${String(options.value)}</span>
    <span class="cmetric__hint">${options.hint}</span>`;
  const cls = cx('cmetric', options.tone && `cmetric--${options.tone}`, options.focus !== undefined && ui.focus === options.focus && options.focus && 'is-active');
  if (options.focus === undefined) return html`<div class="${cls}">${inner}</div>`;
  return html`<button type="button" class="${cx(cls, 'cmetric--button')}" data-action="commercial:focus" data-value="${options.focus}" title="Filtrar o funil">${inner}</button>`;
}

function infoItem(label: string, value: SafeHtml | string | null | undefined): SafeHtml {
  return html`<div class="info__item"><dt>${label}</dt><dd>${value || html`<span class="muted">—</span>`}</dd></div>`;
}

function renderDetail(opp: Opportunity): SafeHtml {
  const { data } = store();
  const t = today();
  const finance = allowed('finance:view');
  const tasks = tasksRelatedTo(data, { type: 'opportunity', id: opp.id });
  const open = isOpenStage(opp.stage);
  const proposals = proposalsOfOpportunity(data, opp);

  return html`
    ${pageHeader({
      title: opp.company,
      back: { href: '#/comercial', label: 'Comercial' },
      subtitle: html`${badge(stageLabel(data, opp.stage), stageTone(data, opp.stage))} ${demoTag(opp)} <span class="muted">${opp.segment}</span>`,
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
                ${pipelineStages(data).map((s) => html`<option value="${s.id}" ${s.id === opp.stage ? 'selected' : ''}>${s.label}</option>`)}
              </select>
            </div>
            ${open
              ? html`<div class="next-action">
                  <span class="next-action__label">${stageKind(data, opp.stage) === 'nossa_vez' ? 'Próxima ação (depende de vocês)' : stageKind(data, opp.stage) === 'pausado' ? 'Lead para depois' : 'Esperando o cliente'}</span>
                  <p>${opp.nextAction || (stageKind(data, opp.stage) === 'nossa_vez' ? 'Não definida' : 'Nada a fazer até o cliente responder')}</p>
                  ${followChip(opp, t)}
                  ${opp.followUpDate && allowed('commercial:edit') ? html`<button type="button" class="link-button" data-action="opportunity:clear-followup" data-id="${opp.id}">Tirar lembrete</button>` : ''}
                  ${attemptsWithoutReply(opp) ? html`<span class="muted small">${pluralize(attemptsWithoutReply(opp), 'tentativa', 'tentativas')} desde a última resposta</span>` : ''}
                </div>`
              : opp.stage === LOST_STAGE
                ? html`<div class="next-action">
                    <span class="next-action__label">Motivo de não ter fechado</span>
                    <p>${opp.lostReason || 'Não anotado'}</p>
                    ${allowed('commercial:edit') ? html`<button type="button" class="link-button" data-action="lost:ask" data-id="${opp.id}">${opp.lostReason ? 'Trocar motivo' : 'Anotar motivo'}</button>` : ''}
                  </div>`
                : ''}
            ${opp.clientId
              ? html`<a class="btn btn--secondary btn--block" href="#/clientes/${opp.clientId}">${icon('clients', 16)} Ver cliente</a>`
              : opp.stage === WON_STAGE || open
                ? button({ label: opp.stage === WON_STAGE ? 'Converter em cliente' : 'Marcar como ganha e criar cliente', action: 'opportunity:convert', icon: 'check', data: { id: opp.id }, variant: opp.stage === WON_STAGE ? 'primary' : 'secondary' })
                : ''}
          `,
        })}
        ${contactPanel(opp)}
        ${panel({
          title: 'Propostas',
          icon: 'file',
          count: proposals.length,
          action: button({ label: 'Nova proposta', action: 'opportunity:proposal', variant: 'ghost', icon: 'plus', size: 'sm', data: { id: opp.id } }),
          body: proposals.length
            ? html`<ul class="link-list">${proposals.map((p) => html`<li><a href="#/comercial/propostas/${p.id}">${p.title}</a></li>`)}</ul>`
            : emptyState({ icon: 'file', compact: true, title: 'Nenhuma proposta ainda' }),
        })}
        <div class="danger-zone">
          ${button({ label: 'Excluir oportunidade', action: 'opportunity:delete', variant: 'ghost', icon: 'trash', size: 'sm', data: { id: opp.id } })}
        </div>
      </aside>
    </div>
  `;
}

// ---------------------------------------------------------------- Configurar etapas do funil

function openStagesModal(): void {
  const { data } = store();
  const stages = pipelineStages(data);
  const open = stages.filter((s) => isOpenStage(s.id));
  const counts = (id: string) => data.opportunities.filter((o) => o.stage === id).length;
  openModal({
    title: 'Etapas do funil',
    description: 'Para cada etapa, diga de quem é a vez. "Nossa vez" pode ficar pendente; "Vez do cliente" nunca fica atrasada (o número de dias diz quando sugerir um follow-up, 0 = nunca); "Pausado" não gera alerta. As duas últimas etapas são finais.',
    size: 'lg',
    body: html`
      <ol class="stage-editor">
        ${stages.map((s) => {
          const final = !isOpenStage(s.id);
          const index = open.findIndex((x) => x.id === s.id);
          return html`<li class="${cx('stage-editor__row', final && 'is-final')}">
            <span class="${cx('stage-editor__dot', `tone--${s.tone}`)}" aria-hidden="true"></span>
            <label class="visually-hidden" for="stage-${s.id}">Nome da etapa</label>
            <input id="stage-${s.id}" class="input" value="${s.label}" data-change="stage:rename" data-id="${s.id}" maxlength="40" />
            ${final
              ? html`<span class="stage-editor__fixed">${icon('lock', 13)} Final</span>`
              : html`<select class="input select stage-editor__tone" aria-label="Cor da etapa ${s.label}" data-change="stage:tone" data-id="${s.id}">
                  ${STAGE_TONES.map((t) => html`<option value="${t.value}" ${t.value === s.tone ? 'selected' : ''}>${t.label}</option>`)}
                </select>`}
            ${final
              ? html`<span></span><span></span>`
              : html`<select class="input select stage-editor__kind" aria-label="De quem é a vez em ${s.label}" data-change="stage:kind" data-id="${s.id}">
                  ${STAGE_KINDS.map((k) => html`<option value="${k.value}" ${k.value === (s.kind ?? 'nossa_vez') ? 'selected' : ''}>${k.label}</option>`)}
                </select>
                ${s.kind === 'vez_cliente'
                  ? html`<label class="stage-editor__days" title="Depois de quantos dias sem resposta sugerir follow-up (0 = nunca)">
                      <span class="visually-hidden">Dias para follow-up em ${s.label}</span>
                      <input class="input" type="number" min="0" max="60" value="${s.followUpDays ?? DEFAULT_FOLLOW_UP_DAYS}" data-change="stage:days" data-id="${s.id}" />
                      <small>dias</small>
                    </label>`
                  : html`<span></span>`}`}
            <span class="stage-editor__count" title="Oportunidades nesta etapa">${counts(s.id)}</span>
            <span class="stage-editor__actions">
              ${final
                ? ''
                : html`${button({ label: `Subir ${s.label}`, iconOnly: true, icon: 'arrowUp', variant: 'ghost', size: 'sm', action: 'stage:up', data: { id: s.id } })}
                  ${button({ label: `Descer ${s.label}`, iconOnly: true, icon: 'arrowDown', variant: 'ghost', size: 'sm', action: 'stage:down', data: { id: s.id } })}
                  ${index >= 0 && open.length > 1 ? button({ label: `Remover ${s.label}`, iconOnly: true, icon: 'trash', variant: 'ghost', size: 'sm', action: 'stage:remove', data: { id: s.id } }) : ''}`}
            </span>
          </li>`;
        })}
      </ol>
      <form class="inline-form" data-form="stage:add">
        <label class="visually-hidden" for="stage-new">Nova etapa</label>
        <input id="stage-new" class="input" name="label" placeholder="Nome da nova etapa (entra antes de Ganho)" autocomplete="off" maxlength="40" />
        <button class="btn btn--secondary" type="submit">${icon('plus', 16)}<span>Adicionar etapa</span></button>
      </form>
      <p class="muted small">Para renomear, edite o texto e clique fora do campo.</p>
      <footer class="form-actions"><span></span><div class="form-actions__main"><button type="button" class="btn btn--primary" data-action="modal:close">Concluir</button></div></footer>
    `,
  });
}

function openRemoveStage(id: string): void {
  const { data } = store();
  const count = data.opportunities.filter((o) => o.stage === id).length;
  const targets = pipelineStages(data).filter((s) => s.id !== id);
  openModal({
    title: `Remover "${stageLabel(data, id)}"`,
    description: `${pluralize(count, 'oportunidade está', 'oportunidades estão')} nesta etapa. Escolha para onde mover antes de remover — nada será perdido.`,
    body: html`
      <form class="form" data-form="stage:remove" data-id="${id}">
        ${selectField({ name: 'target', label: 'Mover as oportunidades para', value: openStages(data).find((s) => s !== id) ?? '', options: targets.map((s) => ({ value: s.id, label: s.label })) })}
        ${formActions('Mover e remover etapa', button({ label: 'Voltar', action: 'stage:back', variant: 'ghost', icon: 'arrowLeft' }))}
      </form>
    `,
  });
}

registerForms({
  'stage:add': async (_form, values) => {
    requirePermission('commercial:edit');
    const label = values.text('label');
    if (!label) return;
    await store().apply((draft) => addPipelineStage(draft, label));
    toast('Etapa adicionada.');
    openStagesModal();
  },
  'stage:remove': async (form, values) => {
    requirePermission('commercial:edit');
    const moved = await store().apply((draft, ctx) => removePipelineStage(draft, form.dataset.id!, values.text('target'), ctx));
    toast(`Etapa removida. ${pluralize(moved, 'oportunidade movida', 'oportunidades movidas')}.`);
    openStagesModal();
  },
});

export const commercialView: View = {
  title: (route: Route) =>
    route.params[0] === 'relatorios'
      ? 'Relatórios comerciais'
      : route.params[0] === 'propostas'
      ? findProposal(store().data, route.params[1])?.title ?? 'Propostas'
      : findOpportunity(store().data, route.params[0])?.company ?? 'Comercial',
  render: (route: Route) => {
    if (route.params[0] === 'relatorios') return renderReports();
    if (route.params[0] === 'propostas') {
      if (!route.params[1]) return renderProposals();
      const proposal = findProposal(store().data, route.params[1]);
      if (proposal) return renderProposalDetail(proposal);
      return html`${pageHeader({ title: 'Proposta não encontrada', back: { href: '#/comercial/propostas', label: 'Propostas' } })}
        <div class="panel">${emptyState({ icon: 'file', title: 'Esta proposta não existe ou foi excluída.' })}</div>`;
    }
    if (route.params[0]) {
      const opp = findOpportunity(store().data, route.params[0]);
      if (opp) return renderDetail(opp);
      return html`${pageHeader({ title: 'Oportunidade não encontrada', back: { href: '#/comercial', label: 'Comercial' } })}
        <div class="panel">${emptyState({ icon: 'commercial', title: 'Esta oportunidade não existe ou foi excluída.' })}</div>`;
    }
    return renderOverview();
  },
};
