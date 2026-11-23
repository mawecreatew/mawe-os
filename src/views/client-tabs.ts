/**
 * Abas da ficha do cliente: Onboarding, Briefing, Arquivos, Acessos,
 * Contratos e Depoimentos. A "Visão geral" continua em clients.ts.
 */
import { formatShortDate, formatTimestamp } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import { approvalsOf } from '../domain/approvals.ts';
import {
  ACCESS_SERVICES,
  CLIENT_SOURCES,
  FILE_CATEGORIES,
  addClientFile,
  briefingQuestions,
  clientSource,
  onboardingOf,
  onboardingProgress,
  removeAccess,
  removeClientFile,
  saveAccess,
  saveBriefing,
  saveBriefingQuestions,
  saveClientOrigin,
  sortedContracts,
  toggleOnboarding,
} from '../domain/clientcare.ts';
import { findClient, findUser } from '../domain/selectors.ts';
import type { Client, ClientAccess } from '../domain/types.ts';
import { PROOF_ACCEPT, discardProof, storeProof } from '../app/proofs.ts';
import { allowed, auth, store, today } from '../app/context.ts';
import { button, emptyState, externalLink, notice, panel, progressBar } from '../ui/components.ts';
import { formActions, selectField, textField, textareaField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';
import { approvalList } from './approvals.ts';
import { contractRows } from './contracts.ts';
import { renderSiteTab } from './site-report.ts';

export const CLIENT_TABS = [
  { id: 'geral', label: 'Visão geral', icon: 'clients' },
  { id: 'onboarding', label: 'Onboarding', icon: 'flag' },
  { id: 'briefing', label: 'Briefing', icon: 'file' },
  { id: 'arquivos', label: 'Arquivos', icon: 'folder' },
  { id: 'acessos', label: 'Acessos', icon: 'lock' },
  { id: 'contratos', label: 'Contratos', icon: 'repeat' },
  { id: 'depoimentos', label: 'Depoimentos', icon: 'chat' },
  { id: 'site', label: 'Site', icon: 'globe' },
] as const;

export type ClientTab = (typeof CLIENT_TABS)[number]['id'];

export function clientTabNav(client: Client, active: ClientTab): SafeHtml {
  const { data } = store();
  const counts: Partial<Record<ClientTab, string>> = {
    onboarding: `${onboardingProgress(client).done}/${onboardingProgress(client).total}`,
    arquivos: String((client.files ?? []).length),
    acessos: String((client.accesses ?? []).length),
    contratos: String((data.contracts ?? []).filter((c) => c.clientId === client.id).length),
    depoimentos: String(approvalsOf(data, { clientId: client.id }).filter((a) => a.kind === 'depoimento').length),
  };
  return html`<nav class="subnav subnav--scroll" aria-label="Partes da ficha do cliente">
    ${CLIENT_TABS.map(
      (t) => html`<a class="${cx('subnav__item', active === t.id && 'is-active')}" href="#/clientes/${client.id}${t.id === 'geral' ? '' : `/${t.id}`}" ${active === t.id ? html`aria-current="page"` : ''}>
        ${icon(t.icon, 15)} ${t.label} ${counts[t.id] && counts[t.id] !== '0' ? html`<span class="segmented__count">${counts[t.id]}</span>` : ''}
      </a>`,
    )}
  </nav>`;
}

// ---------------------------------------------------------------- Onboarding

export function onboardingChecklist(client: Client): SafeHtml {
  const steps = onboardingOf(client);
  return html`<ul class="checklist checklist--steps">
    ${steps.map(
      (s) => html`<li class="${cx('checklist__item', s.doneOn && 'is-done')}">
        <label><input type="checkbox" class="check" ${s.doneOn ? 'checked' : ''} data-change="onboarding:toggle" data-client="${client.id}" data-key="${s.key}" />
          <span><strong>${s.label}</strong><small>${s.doneOn ? `Feito em ${formatShortDate(s.doneOn)}` : s.hint}</small></span></label>
      </li>`,
    )}
  </ul>`;
}

function renderOnboarding(client: Client): SafeHtml {
  const p = onboardingProgress(client);
  return panel({
    title: 'Começo do projeto',
    icon: 'flag',
    action: html`<span class="muted small">${p.done} de ${p.total}</span>`,
    body: html`${progressBar((p.done / p.total) * 100, 'Onboarding')}
      ${onboardingChecklist(client)}
      <p class="panel__foot">${icon('info', 13)} Quando tudo estiver marcado, o projeto pode começar sem travar por falta de material.</p>`,
  });
}

// ---------------------------------------------------------------- Briefing

function renderBriefing(client: Client): SafeHtml {
  const { data } = store();
  const questions = briefingQuestions(data);
  const answers = client.briefing?.answers ?? {};
  const answered = questions.filter((q) => answers[q.id]).length;
  return panel({
    title: 'Briefing',
    icon: 'file',
    action: html`<span class="muted small">${answered} de ${questions.length} respondidas</span>`,
    body: html`<form class="form" data-form="briefing:save" data-client="${client.id}">
      ${questions.map((q, i) => textareaField({ name: `q_${q.id}`, label: `${i + 1}. ${q.text}`, value: answers[q.id] ?? '', rows: 2 }))}
      <footer class="form-actions">
        ${button({ label: 'Copiar perguntas', action: 'briefing:copy', icon: 'copy', variant: 'ghost', size: 'sm' })}
        <div class="form-actions__main">
          ${button({ label: 'Editar perguntas', action: 'briefing:questions', icon: 'edit', variant: 'ghost', size: 'sm' })}
          <button type="submit" class="btn btn--primary">Salvar briefing</button>
        </div>
      </footer>
      ${client.briefing?.updatedAt ? html`<p class="muted small">Última atualização: ${formatTimestamp(client.briefing.updatedAt)}</p>` : ''}
    </form>`,
  });
}

// ---------------------------------------------------------------- Arquivos

function fileIcon(type: string): SafeHtml {
  return icon(type === 'application/pdf' ? 'file' : 'image', 18);
}

function renderFiles(client: Client): SafeHtml {
  const { data } = store();
  const files = [...(client.files ?? [])].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const local = auth().mode !== 'supabase';
  const groups = FILE_CATEGORIES.map((cat) => ({ cat, list: files.filter((f) => f.category === cat) })).filter((g) => g.list.length);
  return html`
    ${panel({
      title: 'Guardar arquivo',
      icon: 'download',
      body: html`<form class="form file-form" data-form="client-file:upload" data-client="${client.id}">
        <div class="form-grid">
          <div class="field">
            <label class="field__label" for="client-file">Arquivo (imagem ou PDF)</label>
            <input class="input" id="client-file" name="file" type="file" accept="${PROOF_ACCEPT}" required />
            <p class="field__hint">${local ? 'No protótipo local, imagens são reduzidas e PDFs vão até 1,5 MB.' : 'Até 10 MB. Fica guardado no Supabase, só para vocês.'}</p>
          </div>
          ${selectField({ name: 'category', label: 'Pasta', value: 'Logo e identidade', options: FILE_CATEGORIES.map((c) => ({ value: c, label: c })) })}
        </div>
        <footer class="form-actions"><span class="muted small">Textos em Word ou arquivos grandes: guarde no Drive e cole o link em Visão geral › Acessos e links.</span><div class="form-actions__main"><button type="submit" class="btn btn--primary">${icon('plus', 16)} Guardar</button></div></footer>
      </form>`,
    })}
    ${files.length
      ? groups.map((g) =>
          panel({
            title: g.cat,
            icon: 'folder',
            count: g.list.length,
            body: html`<ul class="file-grid">${g.list.map(
              (f) => html`<li class="file-card">
                <button type="button" class="file-card__open" data-action="proof:open" data-proof="${f.id}" title="Abrir ${f.name}">
                  ${f.type.startsWith('image/') ? html`<img data-proof="${f.id}" alt="${f.name}" />` : html`<span class="file-card__icon">${fileIcon(f.type)}</span>`}
                </button>
                <span class="file-card__name">${f.name}</span>
                <small class="muted">${formatShortDate(f.uploadedAt.slice(0, 10))} · ${findUser(data, f.authorId)?.shortName.split(' ')[0] ?? ''}</small>
                ${button({ label: `Apagar ${f.name}`, iconOnly: true, icon: 'trash', variant: 'ghost', size: 'sm', action: 'client-file:remove', data: { client: client.id, id: f.id } })}
              </li>`,
            )}</ul>`,
          }),
        )
      : html`<div class="panel">${emptyState({ icon: 'folder', title: 'Nenhum arquivo guardado', text: 'Logo, fotos, contrato assinado e comprovantes do cliente ficam todos aqui.' })}</div>`}
  `;
}

// ---------------------------------------------------------------- Acessos

function openAccessForm(clientId: string, access?: ClientAccess): void {
  openModal({
    title: access ? 'Editar acesso' : 'Novo acesso',
    description: 'Anote onde a senha está guardada, nunca a senha.',
    body: html`<form class="form" data-form="access:save" data-client="${clientId}" data-id="${access?.id ?? ''}">
      <div class="form-grid">
        ${textField({ name: 'service', label: 'Conta', value: access?.service ?? '', required: true, suggestions: ACCESS_SERVICES, autofocus: true })}
        ${textField({ name: 'login', label: 'Login (e-mail ou usuário)', value: access?.login })}
        ${textField({ name: 'whereSaved', label: 'Onde a senha está guardada', value: access?.whereSaved, placeholder: 'Ex.: Bitwarden, pasta Clientes' })}
        ${textField({ name: 'whoHasAccess', label: 'Quem tem acesso', value: access?.whoHasAccess, placeholder: 'Ex.: Cliente e Maria' })}
        ${textField({ name: 'url', label: 'Endereço para entrar', value: access?.url, type: 'url', className: 'form-grid__full' })}
      </div>
      ${textareaField({ name: 'notes', label: 'Observações', value: access?.notes, rows: 2 })}
      ${formActions(access ? 'Salvar' : 'Adicionar', access ? button({ label: 'Apagar', action: 'access:remove', variant: 'ghost', icon: 'trash', data: { client: clientId, id: access.id } }) : undefined)}
    </form>`,
  });
}

function renderAccesses(client: Client): SafeHtml {
  const list = client.accesses ?? [];
  return html`
    ${notice({ tone: 'warning', icon: 'lock', title: 'Senhas não ficam aqui', text: 'Guarde as senhas num gerenciador de senhas (o Bitwarden é gratuito) e anote aqui só onde estão. Assim, se alguém entrar no sistema, não entra nas contas dos clientes.' })}
    ${panel({
      title: 'Acessos do cliente',
      icon: 'lock',
      count: list.length,
      action: button({ label: 'Novo acesso', action: 'access:new', variant: 'ghost', icon: 'plus', size: 'sm', data: { client: client.id } }),
      body: list.length
        ? html`<ul class="access-list">${list.map(
            (a) => html`<li class="access-row">
              <button type="button" class="access-row__main" data-action="access:edit" data-client="${client.id}" data-id="${a.id}">
                <strong>${a.service}</strong>
                <span>${[a.login && `Login: ${a.login}`, a.whereSaved && `Senha em: ${a.whereSaved}`, a.whoHasAccess && `Acesso: ${a.whoHasAccess}`].filter(Boolean).join(' · ') || 'Sem detalhes'}</span>
              </button>
              ${a.url ? externalLink(a.url, 'Entrar') : ''}
            </li>`,
          )}</ul>`
        : emptyState({ icon: 'lock', compact: true, title: 'Nenhum acesso anotado', text: 'Domínio, hospedagem, Instagram, e-mail: anote onde está cada acesso deste cliente.' }),
    })}
  `;
}

// ---------------------------------------------------------------- Contratos e depoimentos

function renderContracts(client: Client): SafeHtml {
  const list = sortedContracts(store().data, today(), client.id);
  return panel({
    title: 'Contratos',
    icon: 'repeat',
    count: list.length,
    action: button({ label: 'Novo contrato', action: 'contract:new', variant: 'ghost', icon: 'plus', size: 'sm', data: { client: client.id } }),
    body: list.length ? contractRows(list, { showClient: false }) : emptyState({ icon: 'repeat', compact: true, title: 'Nenhum contrato', text: 'Registre o site, a manutenção e o domínio. O sistema avisa 30 dias antes de vencer.' }),
  });
}

function renderTestimonials(client: Client): SafeHtml {
  const list = approvalsOf(store().data, { clientId: client.id }).filter((a) => a.kind === 'depoimento');
  return panel({
    title: 'Depoimentos',
    icon: 'chat',
    count: list.length,
    action: allowed('projects:edit') ? button({ label: 'Registrar depoimento', action: 'approval:new', variant: 'ghost', icon: 'plus', size: 'sm', data: { client: client.id, kind: 'depoimento' } }) : undefined,
    body: list.length
      ? html`${approvalList(list)}<p class="panel__foot">${icon('info', 13)} Antes de postar, confirme com o cliente que pode usar o nome e a frase dele.</p>`
      : emptyState({ icon: 'chat', compact: true, title: 'Nenhum depoimento ainda', text: 'No pós-venda de 7 dias, peça um depoimento. Guarde aqui a frase e o print para usar no Instagram.' }),
  });
}

// ---------------------------------------------------------------- Origem e indicação

export function originSummary(client: Client): SafeHtml {
  const { data } = store();
  const by = client.referredBy ? findClient(data, client.referredBy) : null;
  const referredOthers = data.clients.filter((c) => c.referredBy === client.id);
  return html`<dl class="info info--stack">
    <div class="info__item"><dt>De onde veio</dt><dd>${clientSource(data, client)}</dd></div>
    ${by || client.referredByName ? html`<div class="info__item"><dt>Indicado por</dt><dd>${by ? html`<a href="#/clientes/${by.id}">${by.company}</a>` : client.referredByName}</dd></div>` : ''}
    ${referredOthers.length ? html`<div class="info__item"><dt>Indicou</dt><dd>${referredOthers.map((c, i) => html`${i ? ', ' : ''}<a href="#/clientes/${c.id}">${c.company}</a>`)}</dd></div>` : ''}
  </dl>`;
}

function openOriginForm(client: Client): void {
  const { data } = store();
  openModal({
    title: 'De onde veio este cliente',
    body: html`<form class="form" data-form="origin:save" data-client="${client.id}">
      ${selectField({ name: 'source', label: 'Origem', value: client.source ?? clientSource(data, client), emptyLabel: 'Não informado', options: CLIENT_SOURCES.map((s) => ({ value: s, label: s })) })}
      ${selectField({ name: 'referredBy', label: 'Indicado por um cliente', value: client.referredBy ?? '', emptyLabel: 'Ninguém / outra pessoa', options: data.clients.filter((c) => c.id !== client.id).map((c) => ({ value: c.id, label: c.company })) })}
      ${textField({ name: 'referredByName', label: 'Ou indicado por (nome)', value: client.referredByName ?? '', hint: 'Quando quem indicou não é cliente.' })}
      ${formActions('Salvar')}
    </form>`,
  });
}

export function renderClientTab(client: Client, tab: ClientTab): SafeHtml {
  switch (tab) {
    case 'onboarding':
      return renderOnboarding(client);
    case 'briefing':
      return renderBriefing(client);
    case 'arquivos':
      return renderFiles(client);
    case 'acessos':
      return renderAccesses(client);
    case 'contratos':
      return renderContracts(client);
    case 'depoimentos':
      return renderTestimonials(client);
    case 'site':
      return renderSiteTab(client);
    default:
      return html``;
  }
}

// ---------------------------------------------------------------- Ações

registerForms({
  'briefing:save': async (form, values) => {
    const questions = briefingQuestions(store().data);
    const answers: Record<string, string> = {};
    for (const q of questions) answers[q.id] = values.text(`q_${q.id}`);
    await store().apply((draft, ctx) => saveBriefing(draft, form.dataset.client!, answers, ctx));
    toast('Briefing salvo.');
  },
  'briefing:questions-save': async (_form, values) => {
    await store().apply((draft) => saveBriefingQuestions(draft, values.text('questions').split('\n')));
    closeModal();
    toast('Perguntas do briefing salvas.');
  },
  'client-file:upload': async (form, values) => {
    const input = form.querySelector<HTMLInputElement>('#client-file');
    const file = input?.files?.[0];
    if (!file) throw new Error('Escolha o arquivo.');
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const stored = await storeProof(file, 'clientes/');
      await store().apply((draft, ctx) => addClientFile(draft, form.dataset.client!, { ...stored, category: values.text('category') }, ctx));
      toast('Arquivo guardado.');
    } finally {
      if (button) button.disabled = false;
    }
  },
  'access:save': async (form, values) => {
    const id = form.dataset.id || null;
    await store().apply((draft) =>
      saveAccess(draft, form.dataset.client!, id, {
        service: values.text('service'),
        login: values.text('login'),
        whereSaved: values.text('whereSaved'),
        whoHasAccess: values.text('whoHasAccess'),
        url: values.text('url'),
        notes: values.text('notes'),
      }),
    );
    closeModal();
    toast(id ? 'Acesso salvo.' : 'Acesso anotado.');
  },
  'origin:save': async (form, values) => {
    await store().apply((draft) => saveClientOrigin(draft, form.dataset.client!, { source: values.text('source'), referredBy: values.optional('referredBy'), referredByName: values.text('referredByName') }));
    closeModal();
    toast('Origem salva.');
  },
});

registerActions({
  'onboarding:toggle': async (el) => {
    await store().apply((draft) => toggleOnboarding(draft, el.dataset.client!, el.dataset.key!, today()));
  },
  'briefing:copy': async () => {
    const text = briefingQuestions(store().data)
      .map((q, i) => `${i + 1}. ${q.text}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(`Oi! Para começar o seu site, me responde estas perguntas (pode ser por áudio também):\n\n${text}`);
      toast('Perguntas copiadas. Cole na conversa com o cliente.');
    } catch {
      toast('Não foi possível copiar automaticamente.', 'error');
    }
  },
  'briefing:questions': () => {
    openModal({
      title: 'Perguntas do briefing',
      description: 'Uma pergunta por linha. Valem para todos os clientes.',
      body: html`<form class="form" data-form="briefing:questions-save">
        ${textareaField({ name: 'questions', label: 'Perguntas', value: briefingQuestions(store().data).map((q) => q.text).join('\n'), rows: 12 })}
        ${formActions('Salvar perguntas')}
      </form>`,
      size: 'lg',
    });
  },
  'client-file:remove': async (el) => {
    const ok = await confirmAction({ title: 'Apagar arquivo?', text: 'O arquivo é apagado para os dois e não dá para desfazer.', confirmLabel: 'Apagar' });
    if (!ok) return;
    const file = await store().apply((draft) => removeClientFile(draft, el.dataset.client!, el.dataset.id!));
    await discardProof(file);
    toast('Arquivo apagado.');
  },
  'access:new': (el) => openAccessForm(el.dataset.client!),
  'access:edit': (el) => {
    const client = findClient(store().data, el.dataset.client);
    const access = client?.accesses?.find((a) => a.id === el.dataset.id);
    if (client && access) openAccessForm(client.id, access);
  },
  'access:remove': async (el) => {
    const ok = await confirmAction({ title: 'Apagar acesso?', text: 'Só o registro some. A conta do cliente não muda.', confirmLabel: 'Apagar' });
    if (!ok) return;
    await store().apply((draft) => removeAccess(draft, el.dataset.client!, el.dataset.id!));
    closeModal();
    toast('Acesso apagado.');
  },
  'origin:edit': (el) => {
    const client = findClient(store().data, el.dataset.client);
    if (client) openOriginForm(client);
  },
});

/** Texto curto para mostrar o momento do cliente na lista A a Z. */
export function clientMoment(client: Client): { label: string; tone: 'accent' | 'info' | 'success' | 'neutral' | 'warning' } {
  const { data } = store();
  const projects = data.projects.filter((p) => p.clientId === client.id);
  const running = projects.some((p) => p.status !== 'publicado' && p.status !== 'pausado');
  if (running) return { label: 'Projeto', tone: 'info' };
  if ((client.subscriptions ?? []).some((s) => s.active)) return { label: 'Manutenção', tone: 'success' };
  if (projects.some((p) => p.status === 'publicado')) return { label: 'Pós-venda', tone: 'accent' };
  return { label: 'Sem projeto', tone: 'neutral' };
}

