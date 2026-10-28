/** Projetos: lista, etapas de produção, checklist de entrega, links e decisões. */
import { formatLongDate, formatShortDate, lastDayOfMonth, monthKey, monthLabel, relativeDay } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { formatCurrency, parseMoney, pluralize } from '../core/format.ts';
import { cx, html, multiline, type SafeHtml } from '../core/html.ts';
import { navigate, type Route } from '../core/router.ts';
import { contentsOfProject, serviceIncludes } from '../domain/business.ts';
import { CONTENT_STATUSES, PROJECT_STATUSES, PROJECT_TYPES, STAGE_STATUSES, labelOf, projectStatusLabel, projectTypeForCategory, toneOf } from '../domain/labels.ts';
import {
  addChecklistItem,
  addDecision,
  createProject,
  cycleStageStatus,
  deleteProject,
  monthlyPlanName,
  planMonths,
  renewMonthlyPlan,
  type ProjectCreateOptions,
  removeChecklistItem,
  removeDecision,
  toggleChecklistItem,
  updateProject,
  type ProjectInput,
} from '../domain/operations.ts';
import { currentStage, decisionsOf, findClient, findProject, findUser, projectProgress, tasksRelatedTo } from '../domain/selectors.ts';
import type { Project, ProjectStatus, ProjectType } from '../domain/types.ts';
import { allowed, requirePermission, rerender, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, demoTag, emptyState, externalLink, pageHeader, panel, people, progressBar, segmented } from '../ui/components.ts';
import { peopleField, readPeople } from '../ui/people-picker.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon, type IconName } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';
import { taskList, taskRow } from '../ui/task-row.ts';

const ui = {
  filter: 'ativos' as 'ativos' | 'publicados' | 'todos',
  type: 'todos' as ProjectType | 'todos',
};

function isUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.includes('.');
  } catch {
    return false;
  }
}

const usesRepository = (type: ProjectType) => type === 'site' || type === 'sistema';
const usesArts = (type: ProjectType) => type === 'plano_mensal' || type === 'pacote_conteudo' || type === 'outro';
const usesAmount = (type: ProjectType) => type === 'plano_mensal' || type === 'pacote_conteudo';

/** Passo 1 do "Novo projeto": escolher o tipo. */
export function openProjectTypeChooser(clientId?: string): void {
  const { data } = store();
  if (!data.clients.length) {
    toast('Cadastre um cliente antes de criar um projeto.', 'info');
    navigate('/clientes');
    return;
  }
  openModal({
    title: 'Novo projeto',
    description: 'Que tipo de trabalho é? As etapas, o checklist e os campos mudam conforme o tipo.',
    size: 'lg',
    body: html`<div class="type-chooser">
      ${PROJECT_TYPES.map(
        (t) => html`<button type="button" class="type-chooser__item" data-action="project:choose-type" data-type="${t.value}" data-client="${clientId ?? ''}">
          <span class="type-chooser__icon">${icon(TYPE_ICON[t.value], 20)}</span>
          <strong>${t.label}</strong>
          <small>${t.description}</small>
        </button>`,
      )}
    </div>`,
  });
}

const TYPE_ICON: Record<ProjectType, IconName> = {
  site: 'code',
  plano_mensal: 'repeat',
  pacote_conteudo: 'image',
  sistema: 'database',
  outro: 'layers',
};

export function openProjectForm(project?: Project, clientId?: string, chosenType?: ProjectType): void {
  const { data, currentUser } = store();
  if (!data.clients.length) {
    toast('Cadastre um cliente antes de criar um projeto.', 'info');
    navigate('/clientes');
    return;
  }
  if (!project && !chosenType) return openProjectTypeChooser(clientId);
  const type: ProjectType = project?.type ?? chosenType ?? 'site';
  const t = today();
  const v = project ?? {
    name: '', clientId: clientId || data.clients[0].id, ownerIds: [currentUser.id], status: 'planejamento' as ProjectStatus,
    startDate: t, dueDate: '', description: '', links: { repository: '', production: '', staging: '' },
    extra: { artsFolder: '', social: '', amount: null, billingDay: null }, period: monthKey(t), serviceId: null,
  };
  const services = data.services.filter((s) => (s.active || s.id === v.serviceId) && projectTypeForCategory(s.category) === type);
  const typeLabel = labelOf(PROJECT_TYPES, type);
  const baseName = type === 'plano_mensal' && project ? project.name.replace(/\s*[–-]\s*[A-Za-zÀ-ú]+\/\d{4}\s*$/, '') : v.name;

  openModal({
    title: project ? `Editar projeto · ${typeLabel}` : `Novo projeto · ${typeLabel}`,
    description: project
      ? undefined
      : type === 'plano_mensal'
        ? 'O plano é organizado por mês. Depois, use "Renovar para o próximo mês" para não criar tudo de novo.'
        : 'O projeto começa com as etapas e o checklist padrão deste tipo.',
    size: 'lg',
    body: html`
      <form class="form" data-form="project:save" data-id="${project?.id ?? ''}" data-type="${type}">
        ${services.length && !project
          ? html`<div class="field">
              <label class="field__label" for="project-service">Serviço do catálogo</label>
              <select class="input select" id="project-service" name="serviceId" data-change="project:service">
                <option value="">Nenhum (preencher manualmente)</option>
                ${services.map((s) => html`<option value="${s.id}" data-name="${s.name}" data-price="${String(s.price)}">${s.name} · ${formatCurrency(s.price)}${s.billing === 'mensal' ? '/mês' : ''}</option>`)}
              </select>
              <p class="field__hint">Preenche nome e valor e usa o que está incluso no serviço como checklist.</p>
            </div>`
          : ''}
        ${textField({
          name: 'name',
          label: type === 'plano_mensal' ? 'Nome do plano' : 'Nome do projeto',
          value: baseName,
          required: true,
          autofocus: true,
          placeholder: type === 'plano_mensal' ? 'Ex.: Plano Essencial' : type === 'pacote_conteudo' ? 'Ex.: Pacote de feed – novembro' : 'Ex.: Site institucional',
          hint: type === 'plano_mensal' ? 'O cliente e o mês entram no nome automaticamente (ex.: Plano Essencial – The House – Novembro/2026).' : undefined,
        })}
        <div class="form-grid">
          ${selectField({ name: 'clientId', label: 'Cliente', value: v.clientId, required: true, options: data.clients.map((c) => ({ value: c.id, label: c.company })) })}
          ${selectField({ name: 'status', label: 'Status', value: v.status, options: PROJECT_STATUSES.map((s) => ({ value: s.value, label: projectStatusLabel(type, s.value) })) })}
          ${type === 'plano_mensal'
            ? html`${project ? '' : textField({ name: 'period', label: 'Mês do plano', type: 'month', value: v.period ?? monthKey(t), required: true })}
                ${textField({ name: 'dueDate', label: 'Prazo do mês', type: 'date', value: v.dueDate, hint: 'Vazio = último dia do mês.' })}`
            : html`${textField({ name: 'startDate', label: 'Início', type: 'date', value: v.startDate })}
                ${textField({ name: 'dueDate', label: 'Prazo de entrega', type: 'date', value: v.dueDate, required: true })}`}
          ${peopleField({ name: 'ownerIds', label: 'Responsáveis', data, value: v.ownerIds, className: 'span-2' })}
          ${usesRepository(type)
            ? html`${textField({ name: 'repository', label: 'Repositório GitHub', value: v.links.repository, placeholder: 'github.com/organizacao/projeto', hint: 'Apenas o link. Nenhuma conexão é feita.' })}
                ${textField({ name: 'production', label: type === 'sistema' ? 'Sistema publicado' : 'Site publicado', value: v.links.production, placeholder: 'www.cliente.com.br' })}
                ${textField({ name: 'staging', label: 'Versão de teste', value: v.links.staging, placeholder: 'Link de homologação (opcional)' })}`
            : ''}
          ${usesAmount(type)
            ? html`${textField({ name: 'amount', label: type === 'plano_mensal' ? 'Valor do plano (R$/mês)' : 'Valor do pacote (R$)', value: v.extra.amount ?? '', inputmode: 'decimal' })}
                ${type === 'plano_mensal' ? textField({ name: 'billingDay', label: 'Dia do vencimento', type: 'number', value: v.extra.billingDay ?? '', placeholder: 'Ex.: 10' }) : ''}`
            : ''}
          ${usesArts(type)
            ? html`${textField({ name: 'artsFolder', label: 'Pasta das artes (Drive/Canva)', value: v.extra.artsFolder, placeholder: 'drive.google.com/...' })}
                ${type === 'outro'
                  ? textField({ name: 'production', label: 'Link principal', value: v.links.production, placeholder: 'Opcional' })
                  : textField({ name: 'social', label: 'Redes sociais do cliente', value: v.extra.social, placeholder: '@perfil, link do TikTok...' })}`
            : ''}
          ${type === 'pacote_conteudo' && !project
            ? html`${textField({ name: 'posts', label: 'Posts no feed combinados', type: 'number', placeholder: 'Ex.: 8' })}
                ${textField({ name: 'stories', label: 'Stories combinados', type: 'number', placeholder: 'Ex.: 12' })}`
            : ''}
        </div>
        ${textareaField({ name: 'description', label: 'Descrição e escopo', value: v.description })}
        ${formActions(project ? 'Salvar alterações' : 'Criar projeto', project ? undefined : button({ label: 'Trocar tipo', action: 'project:new', variant: 'ghost', icon: 'arrowLeft', data: { client: clientId ?? '' } }))}
      </form>
    `,
  });
}

registerForms({
  'project:save': async (form, values) => {
    requirePermission('projects:edit');
    const type = (form.dataset.type || 'site') as ProjectType;
    const id = form.dataset.id;
    const links = { repository: values.text('repository'), production: values.text('production'), staging: values.text('staging') };
    for (const [key, value] of Object.entries(links)) {
      if (!isUrl(value)) throw new Error(`O link "${key === 'repository' ? 'Repositório' : key === 'production' ? 'Site publicado' : 'Versão de teste'}" não parece válido.`);
    }
    if (!isUrl(values.text('artsFolder'))) throw new Error('O link da pasta das artes não parece válido.');
    const amountText = values.text('amount');
    const amount = amountText ? parseMoney(amountText) : null;
    if (amountText && amount === null) throw new Error('Valor inválido.');
    const dayText = values.text('billingDay');
    const extra = {
      artsFolder: values.text('artsFolder'),
      social: values.text('social'),
      amount,
      billingDay: dayText ? Number(dayText) : null,
    };
    const input: ProjectInput = {
      name: values.text('name'),
      clientId: values.text('clientId'),
      ownerIds: readPeople(values, 'ownerIds'),
      status: values.text('status') as ProjectStatus,
      startDate: values.text('startDate'),
      dueDate: values.text('dueDate'),
      description: values.text('description'),
      type,
      serviceId: values.optional('serviceId'),
    };
    if (usesRepository(type)) input.links = links;
    if (type === 'outro') input.links = { production: links.production };
    if (usesArts(type) || usesAmount(type)) input.extra = extra;
    if (!input.name) throw new Error('Informe o nome do projeto.');
    if (type !== 'plano_mensal' && !input.dueDate) throw new Error('Informe o prazo do projeto.');

    if (id) {
      const current = findProject(store().data, id);
      if (current?.type === 'plano_mensal' && current.period) {
        const client = store().data.clients.find((c) => c.id === input.clientId);
        input.name = monthlyPlanName(input.name, client?.company ?? '', current.period);
        if (!input.dueDate) input.dueDate = lastDayOfMonth(current.period);
      }
      input.startDate = current?.type === 'plano_mensal' ? current.startDate : values.text('startDate') || current?.startDate || today();
      await store().apply((draft) => updateProject(draft, id, input));
    } else {
      if (type === 'plano_mensal') {
        input.period = values.text('period');
        input.startDate = `${input.period}-01`;
      }
      const service = input.serviceId ? store().data.services.find((s) => s.id === input.serviceId) : undefined;
      const options: ProjectCreateOptions = {};
      if (service && type !== 'site' && type !== 'sistema' && serviceIncludes(service).length) options.checklist = serviceIncludes(service);
      if (type === 'pacote_conteudo') {
        const posts = Number(values.text('posts')) || 0;
        const stories = Number(values.text('stories')) || 0;
        const counts = [posts ? `${posts} ${posts === 1 ? 'post' : 'posts'} no feed` : '', stories ? `${stories} ${stories === 1 ? 'story' : 'stories'}` : ''].filter(Boolean);
        if (counts.length) options.extraChecklist = counts;
      }
      const project = await store().apply((draft, ctx) => createProject(draft, input, ctx, options));
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
  'project:new': (el) => openProjectTypeChooser(el.dataset.client || undefined),
  'project:choose-type': (el) => openProjectForm(undefined, el.dataset.client || undefined, el.dataset.type as ProjectType),
  'project:service': (el) => {
    const select = el as HTMLSelectElement;
    const option = select.selectedOptions[0];
    const form = select.closest('form');
    if (!form || !option?.dataset.name) return;
    const name = form.querySelector<HTMLInputElement>('input[name="name"]');
    const amount = form.querySelector<HTMLInputElement>('input[name="amount"]');
    if (name) name.value = option.dataset.name;
    if (amount) amount.value = (option.dataset.price ?? '').replace('.', ',');
  },
  'project:delete': async (el) => {
    requirePermission('projects:edit');
    const project = findProject(store().data, el.dataset.id);
    if (!project) return;
    const ok = await confirmAction({
      title: 'Excluir projeto',
      text: `Tem certeza que deseja excluir este projeto? "${project.name}" será apagado com as etapas, o checklist e as decisões dele. Tarefas e conteúdos ligados continuam, só perdem o vínculo.`,
      confirmLabel: 'Excluir projeto',
    });
    if (!ok) return;
    await store().apply((draft) => deleteProject(draft, project.id));
    toast('Projeto excluído.');
    navigate('/projetos');
  },
  'project:renew': async (el) => {
    requirePermission('projects:edit');
    const next = await store().apply((draft, ctx) => renewMonthlyPlan(draft, el.dataset.id!, ctx));
    toast(`Plano renovado: ${next.period ? monthLabel(next.period) : 'próximo mês'} criado.`);
    navigate(`/projetos/${next.id}`);
  },
  'projects:type': (el) => {
    ui.type = el.dataset.value as typeof ui.type;
    rerender();
  },
  'project:edit': (el) => {
    const project = findProject(store().data, el.dataset.id);
    if (project) openProjectForm(project);
  },
  'project:status': async (el) => {
    requirePermission('projects:edit');
    const status = (el as HTMLSelectElement).value as ProjectStatus;
    await store().apply((draft) => updateProject(draft, el.dataset.id!, { status }));
    const project = findProject(store().data, el.dataset.id);
    toast(`Status alterado para "${projectStatusLabel(project?.type ?? 'site', status)}".`);
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
  const ofType = data.projects.filter((p) => ui.type === 'todos' || p.type === ui.type);
  const list = ofType
    .filter((p) => (ui.filter === 'todos' ? true : ui.filter === 'ativos' ? isActive(p) : !isActive(p)))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const activeCount = data.projects.filter(isActive).length;
  const filteredActive = ofType.filter(isActive).length;

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
          { value: 'ativos', label: 'Ativos', count: filteredActive },
          { value: 'publicados', label: 'Publicados', count: ofType.length - filteredActive },
          { value: 'todos', label: 'Todos', count: ofType.length },
        ],
      })}
      ${segmented({
        label: 'Filtrar por tipo',
        action: 'projects:type',
        value: ui.type,
        items: [
          { value: 'todos', label: 'Todos os tipos' },
          ...PROJECT_TYPES.filter((t) => t.value === ui.type || data.projects.some((p) => p.type === t.value)).map((t) => ({ value: t.value, label: t.label, count: data.projects.filter((p) => p.type === t.value).length })),
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
                ${badge(projectStatusLabel(p.type, p.status), toneOf(PROJECT_STATUSES, p.status))}
              </span>
              <span class="project-card__type">${icon(TYPE_ICON[p.type], 13)} ${labelOf(PROJECT_TYPES, p.type)}</span>
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

function textRow(label: string, value: string | SafeHtml): SafeHtml {
  return html`<div class="info__item"><dt>${label}</dt><dd>${value || html`<span class="muted">Não informado</span>`}</dd></div>`;
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
  const type = project.type;
  const months = planMonths(data, project);
  const isLatestMonth = type === 'plano_mensal' && months[0]?.id === project.id;
  const contents = type === 'plano_mensal' || type === 'pacote_conteudo' ? contentsOfProject(data, project.id) : [];
  const finance = allowed('finance:view');

  return html`
    ${pageHeader({
      title: project.name,
      back: { href: '#/projetos', label: 'Projetos' },
      subtitle: html`${badge(labelOf(PROJECT_TYPES, type), toneOf(PROJECT_TYPES, type))} ${client ? html`<a href="#/clientes/${client.id}">${client.company}</a>` : ''} ${demoTag(project)}`,
      actions: html`
        ${isLatestMonth ? button({ label: 'Renovar para o próximo mês', action: 'project:renew', icon: 'repeat', variant: 'primary', data: { id: project.id } }) : ''}
        ${button({ label: 'Editar', action: 'project:edit', icon: 'edit', data: { id: project.id } })}
        ${button({ label: 'Excluir', action: 'project:delete', icon: 'trash', variant: 'ghost', data: { id: project.id } })}`,
    })}

    <div class="project-summary panel">
      <div class="project-summary__item">
        <span class="project-summary__label">Status</span>
        <select class="input select select--inline" data-change="project:status" data-id="${project.id}" aria-label="Status do projeto">
          ${PROJECT_STATUSES.map((s) => html`<option value="${s.value}" ${s.value === project.status ? 'selected' : ''}>${projectStatusLabel(type, s.value)}</option>`)}
        </select>
      </div>
      <div class="project-summary__item"><span class="project-summary__label">Responsável</span>${people(data, project.ownerIds)}</div>
      <div class="project-summary__item">
        <span class="project-summary__label">${type === 'plano_mensal' ? `Prazo do mês${project.period ? ` · ${monthLabel(project.period)}` : ''}` : 'Prazo de entrega'}</span>
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
          title: type === 'plano_mensal' ? 'Etapas do mês' : 'Etapas de produção',
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
          title: type === 'plano_mensal' ? 'Entregas do plano' : 'Checklist de entrega',
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

        ${type === 'plano_mensal' || type === 'pacote_conteudo'
          ? panel({
              title: 'Conteúdos no calendário',
              icon: 'calendar',
              count: contents.length,
              action: button({ label: 'Novo conteúdo', action: 'content:new', variant: 'ghost', icon: 'plus', size: 'sm', data: { client: project.clientId, project: project.id } }),
              body: html`
                ${contents.length
                  ? html`<ul class="content-mini-list">${contents.map(
                      (c) => html`<li>
                        <button type="button" class="content-mini" data-action="content:edit" data-id="${c.id}">
                          <span class="content-mini__date">${formatShortDate(c.date)}${c.time ? ` · ${c.time}` : ''}</span>
                          <span class="content-mini__title">${c.title}</span>
                          <span class="muted small">${c.format} · ${c.network}</span>
                          ${badge(labelOf(CONTENT_STATUSES, c.status), toneOf(CONTENT_STATUSES, c.status))}
                        </button>
                      </li>`,
                    )}</ul>`
                  : emptyState({ icon: 'calendar', compact: true, title: 'Nenhum conteúdo planejado', text: 'Os conteúdos deste projeto aparecem também no Calendário de conteúdo.' })}
                <p class="panel__foot">${pluralize(contents.filter((c) => c.status === 'postado').length, 'postado', 'postados')} de ${contents.length} · <a href="#/calendario">Abrir calendário</a></p>
              `,
            })
          : ''}

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
          title: usesRepository(type) ? 'Links' : 'Informações',
          icon: 'link',
          action: button({ label: 'Editar', iconOnly: true, icon: 'edit', variant: 'ghost', size: 'sm', action: 'project:edit', data: { id: project.id } }),
          body: html`<dl class="info info--stack">
            ${usesRepository(type)
              ? html`${linkRow('Repositório GitHub', project.links.repository)}
                  ${linkRow(type === 'sistema' ? 'Sistema publicado' : 'Site publicado', project.links.production)}
                  ${linkRow('Versão de teste', project.links.staging)}`
              : ''}
            ${usesArts(type) ? linkRow('Pasta das artes', project.extra.artsFolder) : ''}
            ${type === 'outro' ? linkRow('Link principal', project.links.production) : ''}
            ${type === 'plano_mensal' || type === 'pacote_conteudo' ? textRow('Redes sociais do cliente', project.extra.social) : ''}
            ${usesAmount(type) && finance
              ? textRow(type === 'plano_mensal' ? 'Valor do plano' : 'Valor do pacote', project.extra.amount !== null ? `${formatCurrency(project.extra.amount, true)}${type === 'plano_mensal' ? '/mês' : ''}` : '')
              : ''}
            ${type === 'plano_mensal' ? textRow('Vencimento', project.extra.billingDay ? `Todo dia ${project.extra.billingDay}` : '') : ''}
          </dl>`,
        })}

        ${type === 'plano_mensal'
          ? panel({
              title: 'Meses deste plano',
              icon: 'calendar',
              count: months.length,
              body: html`<ul class="month-list">${months.map(
                (m) => html`<li>
                  <a class="${cx('month-list__item', m.id === project.id && 'is-current')}" href="#/projetos/${m.id}" ${m.id === project.id ? html`aria-current="page"` : ''}>
                    <span>${m.period ? monthLabel(m.period) : m.name}</span>
                    <span class="month-list__meta">${projectProgress(m)}% ${badge(projectStatusLabel(m.type, m.status), toneOf(PROJECT_STATUSES, m.status))}</span>
                  </a>
                </li>`,
              )}</ul>
              ${isLatestMonth ? html`<p class="panel__foot">${icon('info', 13)} "Renovar" cria o próximo mês com as mesmas etapas e entregas, desmarcadas.</p>` : ''}`,
            })
          : ''}

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
        <div class="danger-zone">
          ${button({ label: 'Excluir projeto', action: 'project:delete', variant: 'ghost', icon: 'trash', size: 'sm', data: { id: project.id } })}
        </div>
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
