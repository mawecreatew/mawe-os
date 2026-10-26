/** Linha de tarefa reutilizada no Painel, em Tarefas e nos detalhes de projetos. */
import { cx, html, type SafeHtml } from '../core/html.ts';
import { labelOf, PRIORITIES, toneOf } from '../domain/labels.ts';
import { isOverdue, relatedLabel } from '../domain/selectors.ts';
import type { AppData, Task } from '../domain/types.ts';
import { avatarStack, badge, dueDate } from './components.ts';

export function taskRow(data: AppData, task: Task, today: string, options: { showRelated?: boolean; showAssignee?: boolean } = {}): SafeHtml {
  const done = task.status === 'concluida';
  const related = options.showRelated === false ? null : relatedLabel(data, task.related);
  return html`
    <li class="${cx('task-row', done && 'is-done', isOverdue(task, today) && 'is-overdue')}">
      <input type="checkbox" class="check" ${done ? 'checked' : ''} data-change="task:toggle" data-id="${task.id}"
        aria-label="${done ? 'Reabrir' : 'Concluir'} tarefa: ${task.title}" />
      <div class="task-row__main">
        <button type="button" class="task-row__title" data-action="task:edit" data-id="${task.id}">${task.title}</button>
        <div class="task-row__meta">
          ${dueDate(task.dueDate, today, done)}
          ${related ? html`<a class="task-row__related" href="${related.href}">${related.label}</a>` : ''}
        </div>
      </div>
      <div class="task-row__side">
        ${task.priority === 'alta' && !done ? badge(labelOf(PRIORITIES, task.priority), toneOf(PRIORITIES, task.priority)) : ''}
        ${options.showAssignee === false ? '' : avatarStack(data, task.assigneeIds)}
      </div>
    </li>
  `;
}

export function taskList(rows: SafeHtml[]): SafeHtml {
  return html`<ul class="task-list">${rows}</ul>`;
}
