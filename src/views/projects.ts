/** Projetos: lista, etapas de produção, checklist de entrega, links e decisões. */
import { formatLongDate, formatShortDate, relativeDay } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { pluralize } from '../core/format.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import { navigate, type Route } from '../core/router.ts';
import { PROJECT_STATUSES, STAGE_STATUSES, labelOf, toneOf } from '../domain/labels.ts';
import {
  addChecklistItem,
  addDecision,
  createProject,
  cycleStageStatus,
  removeChecklistItem,
  removeDecision,
  toggleChecklistItem,
  updateProject,
  type ProjectInput,
} from '../domain/operations.ts';
import { currentStage, decisionsOf, findClient, findProject, findUser, projectProgress, tasksRelatedTo } from '../domain/selectors.ts';
import type { Project, ProjectStatus } from '../domain/types.ts';
import { requirePermission, rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, demoTag, emptyState, externalLink, pageHeader, panel, people, progressBar, segmented } from '../ui/components.ts';
import { peopleField, readPeople } from '../ui/people-picker.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';
import { taskList, taskRow } from '../ui/task-row.ts';

const ui = { filter: 'ativos' as 'ativos' | 'publicados' | 'todos' };

function isUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.includes('.');
  } catch {
    return false;
  }
}

export function openProjectForm(project?: Project, clientId?: string): void {
  const { data, currentUser } = store();
  if (!data.clients.length) {
    toast('Cadastre um cliente antes de criar um projeto.', 'info');
    navigate('/clientes');
    return;
  }
  const v = project ?? {
    name: '', clientId: clientId ?? data.clients[0].id, ownerIds: [currentUser.id], status: 'planejamento' as ProjectStatus,
    startDate: today(), dueDate: '', description: '', links: { repository: '', production: '', staging: '' },
  };
  openModal({
    title: project ? 'Editar projeto' : 'Novo projeto',
    description: project ? undefined : 'O projeto começa com as etapas e o checklist padrão da agência.',
    size: 'lg',
    body: html`
      <form class="form" data-form="project:save" data-id="${project?.id ?? ''}">
        ${textField({ name: 'name', label: 'Nome do projeto', value: v.name, required: true, autofocus: true, placeholder: 'Ex.: Site institucional' })}
        <div class="form-grid">
          ${selectField({ name: 'clientId', label: 'Cliente', value: v.clientId, required: true, options: data.clients.map((c) => ({ value: c.id, label: c.company })) })}
          ${selectField({ name: 'status', label: 'Status', value: v.status, options: PROJECT_STATUSES })}
          ${textField({ name: 'startDate', label: 'Início', type: 'date', value: v.startDate })}
          ${textField({ name: 'dueDate', label: 'Prazo de entrega', type: 'date', value: v.dueDate, required: true })}
          ${peopleField({ name: 'ownerIds', label: 'Responsáveis', data, value: v.ownerIds, className: 'span-2' })}
          ${textField({ name: 'repository', label: 'Repositório GitHub', value: v.links.repository, placeholder: 'github.com/organizacao/projeto', hint: 'Apenas o link. Nenhuma conexão é feita.' })}
          ${textField({ name: 'production', label: 'Site publicado', value: v.links.production, placeholder: 'www.cliente.com.br' })}
          ${textField({ name: 'staging', label: 'Versão de teste', value: v.links.staging, placeholder: 'Link de homologação (opcional)' })}
        </div>
        ${textareaField({ name: 'description', label: 'Descrição e escopo', value: v.description })}
        ${formActions(project ? 'Salvar alterações' : 'Criar projeto')}
      </form>
    `,
  });
}

registerForms({
  'project:save': async (form, values) => {
    requirePermission('projects:edit');
    const links = { repository: values.text('repository'), production: values.text('production'), staging: values.text('staging') };
    for (const [key, value] of Object.entries(links)) {
      if (!isUrl(value)) throw new Error(`O link "${key === 'repository' ? 'Repositório' : key === 'production' ? 'Site publicado' : 'Versão de teste'}" não parece válido.`);
    }
    const input: ProjectInput = {
      name: values.text('name'),
      clientId: values.text('clientId'),
      ownerIds: readPeople(values, 'ownerIds'),
      status: values.text('status') as ProjectStatus,
      startDate: values.text('startDate'),
      dueDate: values.text('dueDate'),
      description: values.text('description'),
      links,
    };
    if (!input.name || !input.dueDate) throw new Error('Informe o nome e o prazo do projeto.');
    const id = form.dataset.id;
    if (id) await store().apply((draft) => updateProject(draft, id, input));
    else {
      const project = await store().apply((draft, ctx) => createProject(draft, input, ctx));
      navigate(`/projetos/${project.id}`);
    }
    closeModal();
    toast(id ? 'Projeto atualizado.' : 'Projeto criado.');
  },
  'checklist:add': async (form, values) => {
    await store().apply((draft) => addChecklistItem(draft, form.dataset.project!, values.text('text')));
  },
  'decision:save': async (form, values) => {
    requirePermission('decisions:edit');
    const title = values.text('title');
    if (!title) throw new Error('Descreva a decisão.');
    await store().apply((draft, ctx) => addDecision(draft, { title, context: values.text('context'), projectId: form.dataset.project || null }, ctx));
    closeModal();
    toast('Decisão registrada.');
  },
});

/** Formulário de decisão, usado em projetos e na Biblioteca. */
export function openDecisionForm(projectId: string | null): void {
  openModal({
    title: 'Registrar decisão',
    description: projectId ? `Projeto: ${findProject(store().data, projectId)?.name ?? ''}` : 'Decisão da agência (vale para todos os projetos).',
    body: html`
      <form class="form" data-form="decision:save" data-project="${projectId ?? ''}">
        ${textField({ name: 'title', label: 'Decisão', required: true, autofocus: true, placeholder: 'O que foi decidido?' })}
        ${textareaField({ name: 'context', label: 'Contexto e motivo', rows: 4, placeholder: 'Por que decidimos assim? O que considerar no futuro?' })}
        ${formActions('Registrar decisão')}
      </form>
    `,
  });
}

registerActions({
  'project:new': () => openProjectForm(),
  'project:edit': (el) => {
    const project = findProject(store().data, el.dataset.id);
    if (project) openProjectForm(project);
  },
  'project:status': async (el) => {
    requirePermission('projects:edit');
    const status = (el as HTMLSelectElement).value as ProjectStatus;
    await store().apply((draft) => updateProject(draft, el.dataset.id!, { status }));
    toast(`Status alterado para "${labelOf(PROJECT_STATUSES, status)}".`);
  },
  'project:stage': async (el) => {
    requirePermission('projects:edit');
    await store().apply((draft) => cycleStageStatus(draft, el.dataset.project!, el.dataset.id!));
  },
  'checklist:toggle': async (el) => {
    await store().apply((draft) => toggleChecklistItem(draft, el.dataset.project!, el.dataset.id!));
  },
  'checklist:remove': async (el) => {
    await store().apply((draft) => removeChecklistItem(draft, el.dataset.project!, el.dataset.id!));
  },
  'decision:new': (el) => openDecisionForm(el.dataset.project || null),
  'decision:remove': async (el) => {
    const ok = await confirmAction({ title: 'Remover decisão', text: 'O registro desta decisão será apagado.', confirmLabel: 'Remover' });
    if (!ok) return;
    await store().apply((draft) => removeDecision(draft, el.dataset.id!));
  },
  'projects:filter': (el) => {
    ui.filter = el.dataset.value as typeof ui.filter;
    rerender();
  },
});

function renderList(): SafeHtml {
  const { data } = store();
  const t = today();
  const isActive = (p: Project) => p.status !== 'publicado';
  const list = data.projects
    .filter((p) => (ui.filter === 'todos' ? true : ui.filter === 'ativos' ? isActive(p) : !isActive(p)))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const activeCount = data.projects.filter(isActive).length;

  return html`
    ${pageHeader({
      title: 'Projetos',
      subtitle: `${pluralize(activeCount, 'projeto ativo', 'projetos ativos')} · ${pluralize(data.projects.length - activeCount, 'publicado', 'publicados')}`,
      actions: button({ label: 'Novo projeto', action: 'project:new', variant: 'primary', icon: 'plus' }),
    })}
    <div class="toolbar">
      ${segmented({
        label: 'Filtrar projetos',
        action: 'projects:filter',
        value: ui.filter,
        items: [
          { value: 'ativos', label: 'Ativos', count: activeCount },
          { value: 'publicados', label: 'Publicados', count: data.projects.length - activeCount },
          { value: 'todos', label: 'Todos', count: data.projects.length },
        ],
      })}
    </div>
    ${list.length
      ? html`<div class="project-grid">
          ${list.map((p) => {
            const progress = projectProgress(p);
            const late = p.status !== 'publicado' && p.dueDate < t;
            return html`<a class="project-card" href="#/projetos/${p.id}">
              <span class="project-card__head">
                <span>
                  <span class="project-card__name">${p.name}</span>
                  <span class="project-card__client">${findClient(data, p.clientId)?.company ?? '—'}</span>
                </span>
                ${badge(labelOf(PROJECT_STATUSES, p.status), toneOf(PROJECT_STATUSES, p.status))}
              </span>
              <span class="project-card__stage">${currentStage(p)}</span>
              <span class="project-mini__progress">${progressBar(progress)}<span>${progress}%</span></span>
              <span class="project-card__foot">
                ${people(data, p.ownerIds)}
                <span class="${cx('project-card__due', late && 'text-danger')}">${icon('calendar', 14)} ${formatShortDate(p.dueDate)}${p.status !== 'publicado' ? ` · ${relativeDay(p.dueDate, t)}` : ''}</span>
              </span>
              ${demoTag(p)}
            </a>`;
          })}
        </div>`
      : html`<div class="panel">${emptyState({
          icon: 'projects',
          title: data.projects.length ? 'Nenhum projeto neste filtro' : 'Nenhum projeto cadastrado',
          text: data.projects.length ? undefined : 'Crie um projeto a partir de um cliente para acompanhar etapas, checklist e decisões.',
          action: data.projects.length ? undefined : button({ label: 'Novo projeto', action: 'project:new', variant: 'primary', icon: 'plus' }),
        })}</div>`}
  `;
}

function linkRow(label: string, value: string): SafeHtml {
  return html`<div class="info__item"><dt>${label}</dt><dd>${value ? externalLink(value, value.replace(/^https?:\/\//, '')) : html`<span class="muted">Não informado</span>`}</dd></div>`;
}

function renderDetail(project: Project): SafeHtml {
  const { data } = store();
  const t = today();
  const client = findClient(data, project.clientId);
  const progress = projectProgress(project);
  const decisions = decisionsOf(data, project.id);
  const tasks = tasksRelatedTo(data, { type: 'project', id: project.id });
  const doneItems = project.checklist.filter((c) => c.done).length;

  return html`
    ${pageHeader({
      title: project.name,
      back: { href: '#/projetos', label: 'Projetos' },
      subtitle: html`${client ? html`<a href="#/clientes/${client.id}">${client.company}</a>` : ''} ${demoTag(project)}`,
      actions: button({ label: 'Editar', action: 'project:edit', icon: 'edit', data: { id: project.id } }),
    })}

    <div class="project-summary panel">
      <div class="project-summary__item">
        <span class="project-summary__label">Status</span>
        <select class="input select select--inline" data-change="project:status" data-id="${project.id}" aria-label="Status do projeto">
          ${PROJECT_STATUSES.map((s) => html`<option value="${s.value}" ${s.value === project.status ? 'selected' : ''}>${s.label}</option>`)}
        </select>
      </div>
      <div class="project-summary__item"><span class="project-summary__label">Responsável</span>${people(data, project.ownerIds)}</div>
      <div class="project-summary__item">
        <span class="project-summary__label">Prazo de entrega</span>
        <strong class="${cx(project.status !== 'publicado' && project.dueDate < t && 'text-danger')}">${formatLongDate(project.dueDate)}</strong>
        ${project.status !== 'publicado' ? html`<small class="muted">${relativeDay(project.dueDate, t)}</small>` : ''}
      </div>
      <div class="project-summary__item project-summary__item--wide">
        <span class="project-summary__label">Progresso</span>
        <span class="project-mini__progress">${progressBar(progress)}<span>${progress}%</span></span>
      </div>
    </div>

    <div class="detail-grid">
      <div class="detail-grid__main">
        ${panel({
          title: 'Etapas de produção',
          icon: 'layers',
          action: html`<span class="muted small">Clique para avançar a etapa</span>`,
          body: project.stages.length
            ? html`<ol class="stages">
                ${project.stages.map(
                  (s, i) => html`<li class="${cx('stage', `stage--${s.status}`)}">
                    <button type="button" class="stage__button" data-action="project:stage" data-project="${project.id}" data-id="${s.id}"
                      aria-label="${s.name}: ${labelOf(STAGE_STATUSES, s.status)}. Clique para avançar.">
                      <span class="stage__marker">${s.status === 'concluida' ? icon('check', 14) : String(i + 1)}</span>
                      <span class="stage__name">${s.name}</span>
                      <span class="stage__status">${labelOf(STAGE_STATUSES, s.status)}</span>
                    </button>
                  </li>`,
                )}
              </ol>`
            : emptyState({ icon: 'layers', compact: true, title: 'Sem etapas definidas' }),
        })}

        ${panel({
          title: 'Checklist de entrega',
          icon: 'tasks',
          action: html`<span class="muted small">${doneItems} de ${project.checklist.length}</span>`,
          body: html`
            ${project.checklist.length
              ? html`<ul class="checklist">${project.checklist.map(
                  (c) => html`<li class="${cx('checklist__item', c.done && 'is-done')}">
                    <label><input type="checkbox" class="check" ${c.done ? 'checked' : ''} data-change="checklist:toggle" data-project="${project.id}" data-id="${c.id}" /><span>${c.text}</span></label>
                    ${button({ label: 'Remover item', iconOnly: true, icon: 'close', variant: 'ghost', size: 'sm', action: 'checklist:remove', data: { project: project.id, id: c.id } })}
                  </li>`,
                )}</ul>`
              : emptyState({ icon: 'tasks', compact: true, title: 'Checklist vazio' })}
            <form class="inline-form" data-form="checklist:add" data-project="${project.id}">
              <label class="visually-hidden" for="checklist-new">Novo item do checklist</label>
              <input id="checklist-new" class="input" name="text" placeholder="Adicionar item ao checklist" autocomplete="off" />
              <button class="btn btn--secondary btn--icon" type="submit" aria-label="Adicionar item">${icon('plus', 16)}</button>
            </form>
          `,
        })}

        ${panel({
          title: 'Tarefas do projeto',
          icon: 'tasks',
          count: tasks.filter((x) => x.status !== 'concluida').length,
          action: button({ label: 'Nova tarefa', action: 'task:new', variant: 'ghost', icon: 'plus', size: 'sm', data: { related: `project:${project.id}` } }),
          body: tasks.length ? taskList(tasks.map((task) => taskRow(data, task, t, { showRelated: false }))) : emptyState({ icon: 'tasks', compact: true, title: 'Nenhuma tarefa ligada a este projeto' }),
        })}
      </div>

      <aside class="detail-grid__side">
        ${panel({
          title: 'Links',
          icon: 'link',
          action: button({ label: 'Editar links', iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', action: 'project:edit', data: { id: project.id } }),
          body: html`<dl class="info info--stack">
            ${linkRow('Repositório GitHub', project.links.repository)}
            ${linkRow('Site publicado', project.links.production)}
            ${linkRow('Versão de teste', project.links.staging)}
          </dl>`,
        })}

        ${panel({
          title: 'Decisões',
          icon: 'decision',
          count: decisions.length,
          action: button({ label: 'Registrar', action: 'decision:new', variant: 'ghost', icon: 'plus', size: 'sm', data: { project: project.id } }),
          body: decisions.length
            ? html`<ul class="decisions">${decisions.map(
                (d) => html`<li class="decision">
                  <div class="decision__head">
                    <strong>${d.title}</strong>
                    ${button({ label: 'Remover decisão', iconOnly: true, icon: 'trash', variant: 'ghost', size: 'sm', action: 'decision:remove', data: { id: d.id } })}
                  </div>
                  ${d.context ? html`<p>${multiline(d.context)}</p>` : ''}
                  <small>${findUser(data, d.authorId)?.shortName ?? '—'} · ${formatShortDate(d.date)}</small>
                </li>`,
              )}</ul>`
            : emptyState({ icon: 'decision', compact: true, title: 'Nenhuma decisão registrada', text: 'Registre escolhas importantes para manter o contexto do projeto.' }),
        })}

        ${project.description ? panel({ title: 'Escopo', body: html`<p>${multiline(project.description)}</p>` }) : ''}
      </aside>
    </div>
  `;
}

export const projectsView: View = {
  title: (route: Route) => findProject(store().data, route.params[0])?.name ?? 'Projetos',
  render: (route: Route) => {
    if (route.params[0]) {
      const project = findProject(store().data, route.params[0]);
      if (project) return renderDetail(project);
      return html`${pageHeader({ title: 'Projeto não encontrado', back: { href: '#/projetos', label: 'Projetos' } })}
        <div class="panel">${emptyState({ icon: 'projects', title: 'Este projeto não existe ou foi removido.' })}</div>`;
    }
    return renderList();
  },
};
