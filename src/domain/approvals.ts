/**
 * Aprovações: o registro de tudo que o cliente aprovou ou pediu (briefing,
 * proposta, prévia, alteração...), com data, canal, a frase do cliente e um
 * print como prova.
 */
import { isValidISODate } from '../core/dates.ts';
import { createId } from '../core/id.ts';
import { logActivity } from './activity.ts';
import type { ActionContext } from './operations.ts';
import type { AppData, Approval, ApprovalKind, ApprovalProof, ID, Tone } from './types.ts';

export const APPROVAL_KINDS: Array<{ value: ApprovalKind; label: string; tone: Tone; hint: string }> = [
  { value: 'briefing', label: 'Briefing recebido', tone: 'info', hint: 'O cliente respondeu o formulário ou mandou as informações.' },
  { value: 'proposta', label: 'Proposta aceita', tone: 'success', hint: 'O cliente disse sim para a proposta.' },
  { value: 'contrato', label: 'Contrato aceito', tone: 'success', hint: 'O cliente confirmou o contrato.' },
  { value: 'pagamento', label: 'Pagamento recebido', tone: 'success', hint: 'Comprovante do Pix ou transferência.' },
  { value: 'previa', label: 'Prévia aprovada', tone: 'accent', hint: 'O cliente aprovou a prévia do site.' },
  { value: 'alteracao', label: 'Alteração solicitada', tone: 'warning', hint: 'O cliente pediu uma rodada de ajustes.' },
  { value: 'entrega', label: 'Entrega aceita', tone: 'success', hint: 'O cliente recebeu e aceitou a entrega.' },
  { value: 'depoimento', label: 'Depoimento autorizado', tone: 'accent', hint: 'O cliente autorizou mostrar o trabalho e o depoimento.' },
  { value: 'outro', label: 'Outro combinado', tone: 'neutral', hint: 'Qualquer outra decisão do cliente que vale guardar.' },
];

export const APPROVAL_CHANNELS = ['WhatsApp', 'Instagram', 'E-mail', 'Formulário', 'Videochamada', 'Pessoalmente'];

/** Rodadas de alteração incluídas em cada projeto. */
export const INCLUDED_REVISIONS = 2;

export function approvalLabel(kind: ApprovalKind): string {
  return APPROVAL_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function approvalTone(kind: ApprovalKind): Tone {
  return APPROVAL_KINDS.find((k) => k.value === kind)?.tone ?? 'neutral';
}

export type ApprovalInput = Pick<Approval, 'kind' | 'clientId' | 'projectId' | 'proposalId' | 'date' | 'channel' | 'summary' | 'quote' | 'link'> & {
  proof?: ApprovalProof | null;
};

/** Mais recentes primeiro. */
export function sortApprovals(list: Approval[]): Approval[] {
  return [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

export function approvalsOf(data: AppData, ref: { clientId?: ID; projectId?: ID; proposalId?: ID }): Approval[] {
  return sortApprovals(
    (data.approvals ?? []).filter(
      (a) =>
        (ref.clientId === undefined || a.clientId === ref.clientId) &&
        (ref.projectId === undefined || a.projectId === ref.projectId) &&
        (ref.proposalId === undefined || a.proposalId === ref.proposalId),
    ),
  );
}

/** Quantas rodadas de alteração o cliente já pediu neste projeto. */
export function revisionRounds(data: AppData, projectId: ID): number {
  return (data.approvals ?? []).filter((a) => a.projectId === projectId && a.kind === 'alteracao').length;
}

function whoLabel(data: AppData, a: Pick<Approval, 'clientId' | 'projectId' | 'proposalId'>): string {
  const client = data.clients.find((c) => c.id === a.clientId);
  if (client) return client.company;
  const project = data.projects.find((p) => p.id === a.projectId);
  if (project) return project.name;
  const proposal = data.proposals.find((p) => p.id === a.proposalId);
  return proposal?.title ?? 'cliente';
}

export function saveApproval(draft: AppData, id: ID | null, input: ApprovalInput, ctx: ActionContext): Approval {
  if (!APPROVAL_KINDS.some((k) => k.value === input.kind)) throw new Error('Escolha o que foi aprovado.');
  if (!isValidISODate(input.date)) throw new Error('Informe a data da aprovação.');
  if (!input.clientId && !input.projectId && !input.proposalId) throw new Error('Escolha o cliente, o projeto ou a proposta.');
  // Projeto escolhido sem cliente: o cliente vem do projeto.
  const project = input.projectId ? draft.projects.find((p) => p.id === input.projectId) : undefined;
  if (input.projectId && !project) throw new Error('Projeto não encontrado.');
  const clientId = input.clientId ?? project?.clientId ?? null;
  if (clientId && !draft.clients.some((c) => c.id === clientId)) throw new Error('Cliente não encontrado.');
  draft.approvals ??= [];
  const fields = {
    kind: input.kind,
    clientId,
    projectId: input.projectId ?? null,
    proposalId: input.proposalId ?? null,
    date: input.date,
    channel: input.channel.trim(),
    summary: input.summary.trim(),
    quote: input.quote.trim(),
    link: input.link.trim(),
  };
  if (id) {
    const current = draft.approvals.find((a) => a.id === id);
    if (!current) throw new Error('Aprovação não encontrada.');
    Object.assign(current, fields);
    if (input.proof !== undefined) current.proof = input.proof;
    return current;
  }
  const approval: Approval = { id: createId('apr'), ...fields, proof: input.proof ?? null, authorId: ctx.userId, createdAt: ctx.now.toISOString() };
  draft.approvals.push(approval);
  logActivity(draft, ctx, `registrou "${approvalLabel(approval.kind)}" de ${whoLabel(draft, approval)}`, '#/aprovacoes');
  return approval;
}

/** Remove o registro. Devolve a prova (se houver) para o arquivo também ser apagado. */
export function deleteApproval(draft: AppData, id: ID): ApprovalProof | null {
  const found = (draft.approvals ?? []).find((a) => a.id === id);
  draft.approvals = (draft.approvals ?? []).filter((a) => a.id !== id);
  return found?.proof ?? null;
}
