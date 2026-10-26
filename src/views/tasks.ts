/** Tela de Tarefas: lista compartilhada com filtros por responsável e situação. */
import { registerActions, registerForms } from '../core/events.ts';
import { cx, html } from '../core/html.ts';
import { pluralize } from '../core/format.ts';
import { PRIORITIES, TASK_STATUSES, labelOf, toneOf } from '../domain/labels.ts';
import { createTask, deleteTask, toggleTaskDone, updateTask, type TaskInput } from '../domain/operations.ts';
import { filterTasks, isOverdue, relatedLabel, type TaskFilters } from '../domain/selectors.ts';
import type { Priority, RelatedRef, Task, TaskStatus } from '../domain/types.ts';
import { allowed, requirePermission, rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, demoTag, dueDate, emptyState, pageHeader, people, segmented } from '../ui/components.ts';
import { peopleField, readPeople } from '../ui/people-picker.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

const filters: TaskFilters = { assigneeId: 'todos', status: 'abertas', search: '' };

function relatedOptions() {
  const { data } = store();
  return [
    ...data.projects.map((p) => ({ value: `project:${p.id}`, label: `Projeto · ${p.name}` })),
    ...data.opportunities
      .filter((o) => o.stage !== 'perdido')
      .map((o) => ({ value: `opportunity:${o.id}`, label: `Oportunidade · ${o.company}` })),
    ...data.clients.map((c) => ({ value: `client:${c.id}`, label: `Cliente · ${c.company}` })),
  ];
}

function parseRelated(value: string | null): RelatedRef | null {
  if (!value) return null;
  const [type, id] = value.split(':');
  return type === 'project' || type === 'opportunity' || type === 'client' ? { type, id } : null;
}

/** Abre o formulário de tarefa (nova ou edição). `defaults` preenche campos ao criar. */
export function openTaskForm(task?: Task, defaults: Partial<TaskInput> = {}): void {
  const { data, currentUser } = store();
  const v = task ?? { title: '', description: '', assigneeIds: [currentUser.id], priority: 'media', status: 'a_fazer', dueDate: today(), related: null, ...defaults };
  openModal({
    title: task ? 'Editar tarefa' : 'Nova tarefa',
    body: html`
      <form class="form" data-form="task:save" data-id="${task?.id ?? ''}">
        ${textField({ name: 'title', label: 'Título', value: v.title, required: true, autofocus: true, placeholder: 'O que precisa ser feito?' })}
        ${peopleField({ name: 'assigneeIds', label: 'Responsáveis', data, value: v.assigneeIds })}
        <div class="form-grid">
          ${textField({ name: 'dueDate', label: 'Prazo', type: 'date', value: v.dueDate ?? '' })}
          ${selectField({ name: 'priority', label: 'Prioridade', value: v.priority, options: PRIORITIES })}
          ${selectField({ name: 'status', label: 'Situação', value: v.status, options: TASK_STATUSES })}
        </div>
        ${selectField({
          name: 'related',
          label: 'Relacionada a',
          value: v.related ? `${v.related.type}:${v.related.id}` : '',
          options: relatedOptions(),
          emptyLabel: 'Nenhum projeto ou oportunidade',
        })}
        ${textareaField({ name: 'description', label: 'Detalhes', value: v.description, rows: 3 })}
        ${formActions(task ? 'Salvar alterações' : 'Criar tarefa', task ? button({ label: 'Excluir', action: 'task:delete', variant: 'danger', icon: 'trash', data: { id: task.id }, size: 'sm' }) : undefined)}
      </form>
    `,
  });
}

registerForms({
  'task:save': async (form, values) => {
    requirePermission('tasks:edit');
    const input: TaskInput = {
      title: values.text('title'),
      description: values.text('description'),
      assigneeIds: readPeople(values, 'assigneeIds'),
      priority: values.text('priority') as Priority,
      status: values.text('status') as TaskStatus,
      dueDate: values.optional('dueDate'),
      related: parseRelated(values.optional('related')),
    };
    if (!input.title) throw new Error('Informe o título da tarefa.');
    const id = form.dataset.id;
    if (id) await store().apply((draft, ctx) => updateTask(draft, id, input, ctx));
    else await store().apply((draft, ctx) => createTask(draft, input, ctx));
    closeModal();
    toast(id ? 'Tarefa atualizada.' : 'Tarefa criada.');
  },
});

registerActions({
  'task:new': (el) => {
    const related = parseRelated(el.dataset.related ?? null);
    openTaskForm(undefined, related ? { related } : {});
  },
  'task:edit': (el) => {
    const task = store().data.tasks.find((t) => t.id === el.dataset.id);
    if (task) openTaskForm(task);
  },
  'task:toggle': async (el) => {
    requirePermission('tasks:edit');
    await store().apply((draft, ctx) => toggleTaskDone(draft, el.dataset.id!, ctx));
    toast((el as HTMLInputElement).checked ? 'Tarefa concluída.' : 'Tarefa reaberta.');
  },
  'task:status': async (el) => {
    requirePermission('tasks:edit');
    const status = (el as HTMLSelectElement).value as TaskStatus;
    await store().apply((draft, ctx) => updateTask(draft, el.dataset.id!, { status }, ctx));
  },
  'task:delete': async (el) => {
    const ok = await confirmAction({ title: 'Excluir tarefa', text: 'A tarefa será removida para os dois sócios. Esta ação não pode ser desfeita.', confirmLabel: 'Excluir' });
    if (!ok) return;
    await store().apply((draft) => deleteTask(draft, el.dataset.id!));
    toast('Tarefa excluída.');
  },
  'tasks:filter-assignee': (el) => {
    filters.assigneeId = el.dataset.value!;
    rerender();
  },
  'tasks:filter-status': (el) => {
    filters.status = el.dataset.value as TaskFilters['status'];
    rerender();
  },
  'tasks:search': (el) => {
    filters.search = (el as HTMLInputElement).value;
    rerender();
  },
});

export const tasksView: View = {
  title: () => 'Tarefas',
  render: () => {
    const { data } = store();
    const t = today();
    const scope = data.tasks.filter((x) => filters.assigneeId === 'todos' || x.assigneeIds.includes(filters.assigneeId));
    const counts = {
      todas: scope.length,
      abertas: scope.filter((x) => x.status !== 'concluida').length,
      atrasadas: scope.filter((x) => isOverdue(x, t)).length,
      concluidas: scope.filter((x) => x.status === 'concluida').length,
    };
    const list = filterTasks(data.tasks, filters, t);
    const canEdit = allowed('tasks:edit');

    const rows = list.map((task) => {
      const done = task.status === 'concluida';
      const related = relatedLabel(data, task.related);
      return html`
        <tr class="${cx(done && 'is-done', isOverdue(task, t) && 'is-overdue')}">
          <td class="cell-check">
            <input type="checkbox" class="check" ${done ? 'checked' : ''} ${canEdit ? '' : 'disabled'} data-change="task:toggle" data-id="${task.id}" aria-label="Concluir: ${task.title}" />
          </td>
          <td class="cell-main">
            <button type="button" class="link-button" data-action="task:edit" data-id="${task.id}">${task.title}</button>
            <span class="cell-sub">${related ? html`<a href="${related.href}">${related.label}</a>` : ''} ${demoTag(task)}</span>
          </td>
          <td data-label="Responsável">${people(data, task.assigneeIds)}</td>
          <td data-label="Prioridade">${badge(labelOf(PRIORITIES, task.priority), toneOf(PRIORITIES, task.priority))}</td>
          <td data-label="Prazo">${dueDate(task.dueDate, t, done)}</td>
          <td data-label="Situação">
            <select class="input select select--inline" data-change="task:status" data-id="${task.id}" aria-label="Situação" ${canEdit ? '' : 'disabled'}>
              ${TASK_STATUSES.map((s) => html`<option value="${s.value}" ${s.value === task.status ? 'selected' : ''}>${s.label}</option>`)}
            </select>
          </td>
        </tr>`;
    });

    const emptyMessages: Record<TaskFilters['status'], string> = {
      abertas: 'Nenhuma tarefa aberta com estes filtros.',
      atrasadas: 'Nenhuma tarefa atrasada. Tudo em dia.',
      concluidas: 'Nenhuma tarefa concluída ainda.',
      todas: 'Nenhuma tarefa cadastrada.',
    };

    return html`
      ${pageHeader({
        title: 'Tarefas',
        subtitle: `${pluralize(counts.abertas, 'tarefa aberta', 'tarefas abertas')} · ${pluralize(counts.atrasadas, 'atrasada', 'atrasadas')}`,
        actions: button({ label: 'Nova tarefa', action: 'task:new', variant: 'primary', icon: 'plus' }),
      })}

      <div class="toolbar">
        ${segmented({
          label: 'Responsável',
          action: 'tasks:filter-assignee',
          value: filters.assigneeId,
          items: [{ value: 'todos', label: 'Equipe' }, ...data.users.map((u) => ({ value: u.id, label: u.shortName }))],
        })}
        ${segmented({
          label: 'Situação',
          action: 'tasks:filter-status',
          value: filters.status,
          items: [
            { value: 'abertas', label: 'Abertas', count: counts.abertas },
            { value: 'atrasadas', label: 'Atrasadas', count: counts.atrasadas },
            { value: 'concluidas', label: 'Concluídas', count: counts.concluidas },
            { value: 'todas', label: 'Todas', count: counts.todas },
          ],
        })}
        <label class="search">
          <span class="visually-hidden">Buscar tarefas</span>
          <input id="task-search" class="input" type="search" placeholder="Buscar tarefas" value="${filters.search ?? ''}" data-input="tasks:search" />
        </label>
      </div>

      ${list.length
        ? html`
          <div class="table-wrap">
            <table class="table table--tasks">
              <thead><tr><th class="cell-check"><span class="visually-hidden">Concluída</span></th><th>Tarefa</th><th>Responsável</th><th>Prioridade</th><th>Prazo</th><th>Situação</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>`
        : html`<div class="panel">${emptyState({
            icon: 'tasks',
            title: data.tasks.length ? emptyMessages[filters.status] : 'Nenhuma tarefa cadastrada',
            text: data.tasks.length ? 'Ajuste os filtros acima para ver outras tarefas.' : 'Crie a primeira tarefa e defina responsável, prioridade e prazo.',
            action: data.tasks.length ? undefined : button({ label: 'Nova tarefa', action: 'task:new', variant: 'primary', icon: 'plus' }),
          })}</div>`}
    `;
  },
};
