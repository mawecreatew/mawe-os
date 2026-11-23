/** Aprovações: o que cada cliente aprovou ou pediu, com a prova (print ou PDF). */
import { formatLongDate, formatShortDate, formatTimestamp } from '../core/dates.ts';
import { registerActions, registerForms } from '../core/events.ts';
import { pluralize } from '../core/format.ts';
import { cx, html, type SafeHtml } from '../core/html.ts';
import type { Route } from '../core/router.ts';
import { APPROVAL_CHANNELS, APPROVAL_KINDS, approvalLabel, approvalTone, deleteApproval, saveApproval, sortApprovals } from '../domain/approvals.ts';
import { findClient, findProject, findUser } from '../domain/selectors.ts';
import type { Approval, ApprovalKind, ID } from '../domain/types.ts';
import { PROOF_ACCEPT, discardProof, storeProof } from '../app/proofs.ts';
import { allowed, auth, rerender, requirePermission, store, today } from '../app/context.ts';
import type { View } from '../app/view.ts';
import { badge, button, demoTag, emptyState, externalLink, notice, pageHeader, segmented } from '../ui/components.ts';
import { formActions, selectField, textareaField, textField } from '../ui/forms.ts';
import { icon } from '../ui/icons.ts';
import { closeModal, confirmAction, openModal, toast } from '../ui/overlay.ts';

const ui: { kind: ApprovalKind | 'todas' } = { kind: 'todas' };

function find(id: string | undefined): Approval | undefined {
  return (store().data.approvals ?? []).find((a) => a.id === id);
}

function whoOf(a: Approval): string {
  const { data } = store();
  return findClient(data, a.clientId)?.company ?? findProject(data, a.projectId)?.name ?? data.proposals.find((p) => p.id === a.proposalId)?.title ?? 'Sem cliente';
}

function proofThumb(a: Approval): SafeHtml {
  if (!a.proof) return html`<span class="proof proof--empty" aria-hidden="true">${icon('image', 18)}</span>`;
  if (a.proof.type === 'application/pdf') return html`<span class="proof proof--pdf">${icon('file', 18)}<small>PDF</small></span>`;
  return html`<span class="proof"><img data-proof="${a.id}" alt="Print: ${approvalLabel(a.kind)}" /></span>`;
}

/** Lista de aprovações (usada também na ficha do cliente, no projeto e na proposta). */
export function approvalList(list: Approval[], options: { showWho?: boolean } = {}): SafeHtml {
  return html`<ul class="approvals">${sortApprovals(list).map(
    (a) => html`<li>
      <button type="button" class="approval" data-action="approval:open" data-id="${a.id}">
        ${proofThumb(a)}
        <span class="approval__main">
          <span class="approval__head">${badge(approvalLabel(a.kind), approvalTone(a.kind))} ${demoTag(a)}</span>
          <span class="approval__title">${options.showWho ? whoOf(a) : a.summary || approvalLabel(a.kind)}</span>
          <span class="approval__meta">${[formatShortDate(a.date), a.channel, options.showWho ? a.summary : ''].filter(Boolean).join(' · ')}</span>
          ${a.quote ? html`<span class="approval__quote">“${a.quote.length > 140 ? `${a.quote.slice(0, 140)}…` : a.quote}”</span>` : ''}
        </span>
      </button>
    </li>`,
  )}</ul>`;
}

export interface ApprovalPreset {
  kind?: ApprovalKind;
  clientId?: ID | null;
  projectId?: ID | null;
  proposalId?: ID | null;
  summary?: string;
}

export function openApprovalForm(pre: ApprovalPreset = {}): void {
  const { data } = store();
  const project = pre.projectId ? findProject(data, pre.projectId) : undefined;
  const clientId = pre.clientId ?? project?.clientId ?? null;
  const proposal = pre.proposalId ? data.proposals.find((p) => p.id === pre.proposalId) : undefined;
  const local = auth().mode !== 'supabase';
  openModal({
    title: 'Registrar aprovação',
    description: 'Guarde a prova do combinado: o que o cliente disse, quando, por onde e o print da conversa.',
    size: 'lg',
    body: html`
      <form class="form" data-form="approval:save" data-project="${pre.projectId ?? ''}" data-proposal="${pre.proposalId ?? ''}">
        <div class="form-grid">
          ${selectField({
            name: 'kind',
            label: 'O que foi aprovado',
            value: pre.kind ?? 'previa',
            options: APPROVAL_KINDS.map((k) => ({ value: k.value, label: k.label })),
            required: true,
          })}
          ${textField({ name: 'date', label: 'Data', type: 'date', value: today(), required: true })}
        </div>
        <div class="form-grid">
          ${selectField({
            name: 'clientId',
            label: 'Cliente',
            value: clientId,
            emptyLabel: proposal && !clientId ? 'Cliente da proposta (ainda no Comercial)' : 'Escolha o cliente',
            options: [...data.clients].sort((a, b) => a.company.localeCompare(b.company)).map((c) => ({ value: c.id, label: c.company })),
          })}
          ${selectField({
            name: 'projectId',
            label: 'Projeto',
            value: pre.projectId ?? '',
            emptyLabel: 'Nenhum projeto',
            options: data.projects.filter((p) => !clientId || p.clientId === clientId).map((p) => ({ value: p.id, label: p.name })),
          })}
        </div>
        ${proposal ? html`<p class="muted small">${icon('file', 13)} Ligada à proposta "${proposal.title}".</p>` : ''}
        <div class="form-grid">
          ${selectField({ name: 'channel', label: 'Por onde', value: 'WhatsApp', options: APPROVAL_CHANNELS.map((c) => ({ value: c, label: c })) })}
          ${textField({ name: 'summary', label: 'Resumo', value: pre.summary, placeholder: 'Ex.: aprovou a prévia sem ajustes' })}
        </div>
        ${textareaField({ name: 'quote', label: 'O que o cliente escreveu', rows: 3, placeholder: 'Cole aqui a mensagem do cliente. Ex.: "Amei! Pode publicar."' })}
        <div class="field">
          <label class="field__label" for="approval-file">Print ou PDF da conversa</label>
          <input class="input" id="approval-file" name="file" type="file" accept="${PROOF_ACCEPT}" />
          <p class="field__hint">${local ? 'No protótipo local o print é reduzido e fica neste navegador.' : 'O arquivo fica guardado no Supabase e só a equipe vê. Até 10 MB.'}</p>
        </div>
        ${textField({ name: 'link', label: 'Link (opcional)', type: 'url', placeholder: 'Prévia, e-mail ou formulário' })}
        ${formActions('Registrar')}
      </form>
    `,
  });
}

registerForms({
  'approval:save': async (form, values) => {
    requirePermission('projects:edit');
    const fileInput = form.querySelector<HTMLInputElement>('input[type=file]');
    const file = fileInput?.files?.[0];
    const submit = form.querySelector<HTMLButtonElement>('button[type=submit]');
    const input = {
      kind: values.text('kind') as ApprovalKind,
      date: values.text('date'),
      clientId: values.optional('clientId'),
      projectId: values.optional('projectId') ?? (form.dataset.project || null),
      proposalId: form.dataset.proposal || null,
      channel: values.text('channel'),
      summary: values.text('summary'),
      quote: values.text('quote'),
      link: values.text('link'),
    };
    let proof = null;
    if (file) {
      if (submit) {
        submit.disabled = true;
        submit.textContent = 'Enviando o arquivo…';
      }
      try {
        proof = await storeProof(file);
      } finally {
        if (submit) {
          submit.disabled = false;
          submit.textContent = 'Registrar';
        }
      }
    }
    try {
      await store().apply((draft, ctx) => saveApproval(draft, null, { ...input, proof }, ctx));
    } catch (error) {
      await discardProof(proof);
      throw error;
    }
    closeModal();
    toast(`${approvalLabel(input.kind)} registrada.`);
  },
});

function openApproval(a: Approval): void {
  const { data } = store();
  const author = findUser(data, a.authorId);
  const client = findClient(data, a.clientId);
  const project = findProject(data, a.projectId);
  const proposal = data.proposals.find((p) => p.id === a.proposalId);
  openModal({
    title: approvalLabel(a.kind),
    description: `${whoOf(a)} · ${formatLongDate(a.date)}${a.channel ? ` · ${a.channel}` : ''}`,
    size: 'lg',
    body: html`
      ${a.summary ? html`<p class="lead-text">${a.summary}</p>` : ''}
      ${a.quote ? html`<blockquote class="approval-quote">“${a.quote}”</blockquote>` : ''}
      ${a.proof
        ? a.proof.type === 'application/pdf'
          ? html`<p>${button({ label: `Abrir ${a.proof.name}`, action: 'proof:open', icon: 'external', data: { proof: a.id } })}</p>`
          : html`<figure class="proof-full"><img data-proof="${a.id}" alt="Print da conversa: ${approvalLabel(a.kind)}" />
              <figcaption>${a.proof.name} · <button type="button" class="link-button" data-action="proof:open" data-proof="${a.id}">abrir em tamanho real</button></figcaption></figure>`
        : notice({ tone: 'info', title: 'Sem print anexado', text: 'A frase do cliente e o link já ajudam. Se tiver o print, registre de novo com ele.' })}
      <dl class="info info--stack">
        ${client ? html`<div class="info__item"><dt>Cliente</dt><dd><a href="#/clientes/${client.id}">${client.company}</a></dd></div>` : ''}
        ${project ? html`<div class="info__item"><dt>Projeto</dt><dd><a href="#/projetos/${project.id}">${project.name}</a></dd></div>` : ''}
        ${proposal ? html`<div class="info__item"><dt>Proposta</dt><dd><a href="#/comercial/propostas/${proposal.id}">${proposal.title}</a></dd></div>` : ''}
        ${a.link ? html`<div class="info__item"><dt>Link</dt><dd>${externalLink(a.link, a.link)}</dd></div>` : ''}
      </dl>
      <p class="muted small">Registrado por ${author?.shortName ?? '—'} em ${formatTimestamp(a.createdAt)}</p>
      <footer class="form-actions">
        ${allowed('projects:edit') ? button({ label: 'Apagar registro', action: 'approval:delete', variant: 'danger', icon: 'trash', size: 'sm', data: { id: a.id } }) : html`<span></span>`}
        <div class="form-actions__main">${button({ label: 'Fechar', action: 'modal:close', variant: 'primary' })}</div>
      </footer>
    `,
  });
}

registerActions({
  'approval:new': (el) =>
    openApprovalForm({
      kind: (el.dataset.kind as ApprovalKind) || undefined,
      clientId: el.dataset.client || null,
      projectId: el.dataset.project || null,
      proposalId: el.dataset.proposal || null,
      summary: el.dataset.summary,
    }),
  'approval:open': (el) => {
    const a = find(el.dataset.id);
    if (a) openApproval(a);
  },
  'approval:delete': async (el) => {
    const ok = await confirmAction({ title: 'Apagar registro', text: 'O registro e o print anexado serão apagados.', confirmLabel: 'Apagar' });
    if (!ok) return;
    const proof = await store().apply((draft) => deleteApproval(draft, el.dataset.id!));
    await discardProof(proof);
    toast('Registro apagado.');
  },
  'approval:filter': (el) => {
    ui.kind = el.dataset.value as ApprovalKind | 'todas';
    rerender();
  },
});

export const approvalsView: View = {
  title: () => 'Aprovações',
  render: (route: Route) => {
    void route;
    const { data } = store();
    const all = data.approvals ?? [];
    const kinds = APPROVAL_KINDS.filter((k) => all.some((a) => a.kind === k.value));
    if (ui.kind !== 'todas' && !kinds.some((k) => k.value === ui.kind)) ui.kind = 'todas';
    const list = ui.kind === 'todas' ? all : all.filter((a) => a.kind === ui.kind);
    const edit = allowed('projects:edit');
    return html`
      ${pageHeader({
        title: 'Aprovações',
        subtitle: `A prova de cada combinado com o cliente · ${pluralize(all.length, 'registro', 'registros')}`,
        actions: edit ? button({ label: 'Registrar aprovação', action: 'approval:new', variant: 'primary', icon: 'plus' }) : undefined,
      })}
      <p class="section-intro">Briefing recebido, proposta aceita, prévia aprovada, alteração pedida: registre com a data, a frase do cliente e o print. Se um dia houver dúvida sobre o que foi combinado, a prova está aqui.</p>
      ${kinds.length > 1
        ? html`<div class="toolbar">${segmented({
            label: 'Tipo de aprovação',
            action: 'approval:filter',
            value: ui.kind,
            items: [{ value: 'todas', label: 'Todas', count: all.length }, ...kinds.map((k) => ({ value: k.value, label: k.label, count: all.filter((a) => a.kind === k.value).length }))],
          })}</div>`
        : ''}
      <div class="${cx('panel', list.length && 'panel--flush')}">
        ${list.length
          ? approvalList(list, { showWho: true })
          : emptyState({
              icon: 'check',
              title: 'Nenhuma aprovação registrada',
              text: 'Quando o cliente disser "pode publicar" no WhatsApp, tire um print e registre aqui.',
              action: edit ? button({ label: 'Registrar aprovação', action: 'approval:new', variant: 'primary', icon: 'plus' }) : undefined,
            })}
      </div>
    `;
  },
};
