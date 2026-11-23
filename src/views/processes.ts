/** Processos: o manual da agência, do primeiro contato ao pós-venda. */
import { formatTimestamp } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { pluralize } from '../core/format.ts';
import { html, type SafeHtml } from '../core/html.ts';
import { DEFAULT_PRODUCTION_STAGES } from '../domain/templates.ts';
import { processManualDocument } from '../domain/documents.ts';
import { PROCESS_AREAS, deleteProcess, moveProcess, orderedProcesses, processAreas, saveProcess } from '../domain/processes.ts';
import { findUser } from '../domain/selectors.ts';
import type { ProcessStep } from '../domain/types.ts';
import { allowed, requirePermission, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { button, emptyState, pageHeader } from '../ui/components.ts';
import { openDocument } from '../ui/document.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

function find(id: string | undefined): ProcessStep | undefined {
  return (store().data.processes ?? []).find((p) => p.id === id);
}

/** Etapas de produção usadas nos projetos (para ligar o processo ao checklist). */
function stageOptions(): Array<{ value: string; label: string }> {
  const names = new Set<string>(DEFAULT_PRODUCTION_STAGES);
  for (const p of store().data.projects) for (const s of p.stages) names.add(s.name);
  return [...names].map((n) => ({ value: n, label: n }));
}

export function openProcessForm(step?: ProcessStep, area?: string): void {
  const areas = [...new Set([...PROCESS_AREAS, ...processAreas(store().data)])];
  openModal({
    title: step ? 'Editar etapa do processo' : 'Nova etapa do processo',
    size: 'lg',
    body: html`
      <form class="form" data-form="process:save" data-id="${step?.id ?? ''}">
        <div class="form-grid">
          ${textField({ name: 'title', label: 'Nome da etapa', value: step?.title, required: true, autofocus: true, placeholder: 'Ex.: Follow-up' })}
          ${textField({ name: 'area', label: 'Área', value: step?.area ?? area ?? PROCESS_AREAS[0], required: true, suggestions: areas, hint: 'Escolha uma da lista ou escreva uma nova.' })}
        </div>
        ${textField({ name: 'goal', label: 'Objetivo', value: step?.goal, placeholder: 'Para que serve esta etapa?' })}
        <div class="form-grid">
          ${textField({ name: 'owner', label: 'Quem faz', value: step?.owner, placeholder: 'Ex.: Maria' })}
          ${textField({ name: 'duration', label: 'Quanto tempo leva', value: step?.duration, placeholder: 'Ex.: 3 dias' })}
        </div>
        ${textareaField({ name: 'steps', label: 'Passo a passo', value: step?.steps.join('\n'), rows: 7, hint: 'Um passo por linha, na ordem.' })}
        ${textareaField({ name: 'tips', label: 'Dicas e cuidados', value: step?.tips, rows: 2 })}
        ${selectField({
          name: 'stageName',
          label: 'Mostrar dentro dos projetos na etapa',
          value: step?.stageName ?? '',
          emptyLabel: 'Não mostrar nos projetos',
          options: stageOptions(),
          hint: 'Quem abrir um projeto nessa etapa vê este passo a passo.',
        })}
        ${formActions(step ? 'Salvar alterações' : 'Adicionar etapa', step ? button({ label: 'Excluir', action: 'process:delete', variant: 'danger', icon: 'trash', size: 'sm', data: { id: step.id } }) : undefined)}
      </form>
    `,
  });
}

registerForms({
  'process:save': async (form, values) => {
    requirePermission('library:edit');
    const id = form.dataset.id || null;
    await store().apply((draft, ctx) =>
      saveProcess(
        draft,
        id,
        {
          title: values.text('title'),
          area: values.text('area'),
          goal: values.text('goal'),
          owner: values.text('owner'),
          duration: values.text('duration'),
          steps: values.text('steps').split('\n'),
          tips: values.text('tips'),
          stageName: values.optional('stageName'),
        },
        ctx,
      ),
    );
    closeModal();
    toast(id ? 'Etapa atualizada.' : 'Etapa adicionada ao manual.');
  },
});

registerActions({
  'process:new': (el) => openProcessForm(undefined, el.dataset.area),
  'process:edit': (el) => openProcessForm(find(el.dataset.id)),
  'process:delete': async (el) => {
    const ok = await confirmAction({ title: 'Excluir etapa', text: 'Esta etapa sai do manual e dos projetos.', confirmLabel: 'Excluir' });
    if (!ok) return;
    await store().apply((draft) => deleteProcess(draft, el.dataset.id!));
    closeModal();
    toast('Etapa excluída.');
  },
  'process:up': async (el) => {
    await store().apply((draft) => moveProcess(draft, el.dataset.id!, -1));
  },
  'process:down': async (el) => {
    await store().apply((draft) => moveProcess(draft, el.dataset.id!, 1));
  },
  'process:pdf': () => {
    openDocument(processManualDocument(store().data, today()), { title: 'Manual de processos' });
  },
});

/** Passo a passo de uma etapa (usado também dentro dos projetos). */
export function processSteps(step: ProcessStep): SafeHtml {
  return html`
    ${step.owner || step.duration
      ? html`<p class="proc__meta">${step.owner ? html`<span>${icon('user', 14)} ${step.owner}</span>` : ''}${step.duration ? html`<span>${icon('clock', 14)} ${step.duration}</span>` : ''}</p>`
      : ''}
    ${step.steps.length ? html`<ol class="proc__steps">${step.steps.map((s) => html`<li>${s}</li>`)}</ol>` : ''}
    ${step.tips ? html`<p class="proc__tip">${icon('info', 14)} ${step.tips}</p>` : ''}
  `;
}

function renderStep(step: ProcessStep, n: number, edit: boolean, first: boolean, last: boolean): SafeHtml {
  const author = findUser(store().data, step.authorId);
  return html`<details class="proc">
    <summary class="proc__summary">
      <span class="proc__n">${n}</span>
      <span class="proc__head">
        <strong class="proc__title">${step.title}</strong>
        ${step.goal ? html`<span class="proc__goal">${step.goal}</span>` : ''}
      </span>
      ${step.stageName ? html`<span class="badge badge--accent" title="Aparece nos projetos">${icon('projects', 12)} ${step.stageName}</span>` : ''}
      <span class="proc__chev" aria-hidden="true">${icon('chevronRight', 16)}</span>
    </summary>
    <div class="proc__body">
      ${processSteps(step)}
      <footer class="proc__foot">
        <span class="muted small">Atualizado por ${author?.shortName ?? '—'} em ${formatTimestamp(step.updatedAt)}</span>
        ${edit
          ? html`<span class="proc__tools">
              ${first ? '' : button({ label: 'Subir', iconOnly: true, icon: 'arrowUp', variant: 'ghost', size: 'sm', action: 'process:up', data: { id: step.id } })}
              ${last ? '' : button({ label: 'Descer', iconOnly: true, icon: 'arrowDown', variant: 'ghost', size: 'sm', action: 'process:down', data: { id: step.id } })}
              ${button({ label: 'Editar', icon: 'edit', size: 'sm', action: 'process:edit', data: { id: step.id } })}
            </span>`
          : ''}
      </footer>
    </div>
  </details>`;
}

export const processesView: View = {
  title: () => 'Processos',
  render: () => {
    const { data } = store();
    const steps = orderedProcesses(data);
    const edit = allowed('library:edit');
    let n = 0;
    return html`
      ${pageHeader({
        title: 'Processos',
        subtitle: `O jeito MaweCreate de trabalhar · ${pluralize(steps.length, 'etapa', 'etapas')}`,
        actions: html`
          ${button({ label: 'Manual em PDF', action: 'process:pdf', icon: 'download' })}
          ${edit ? button({ label: 'Nova etapa', action: 'process:new', variant: 'primary', icon: 'plus' }) : ''}`,
      })}
      <p class="section-intro">Cada etapa diz o objetivo, quem faz, quanto tempo leva e o passo a passo. É o que alguém novo na equipe lê primeiro. As etapas ligadas à produção aparecem dentro de cada projeto.</p>
      ${steps.length
        ? processAreas(data).map((area) => {
            const list = steps.filter((s) => s.area === area);
            return html`<section class="proc-area">
              <header class="proc-area__head">
                <h2 class="proc-area__title">${area}</h2>
                ${edit ? button({ label: 'Adicionar etapa', iconOnly: true, icon: 'plus', variant: 'ghost', size: 'sm', action: 'process:new', data: { area } }) : ''}
              </header>
              <div class="proc-area__list">${list.map((s, i) => renderStep(s, ++n, edit, i === 0, i === list.length - 1))}</div>
            </section>`;
          })
        : html`<div class="panel">${emptyState({
            icon: 'route',
            title: 'Nenhuma etapa escrita ainda',
            text: 'Registre como a agência trabalha, do primeiro contato à entrega.',
            action: edit ? button({ label: 'Nova etapa', action: 'process:new', variant: 'primary', icon: 'plus' }) : undefined,
          })}</div>`}
    `;
  },
};
