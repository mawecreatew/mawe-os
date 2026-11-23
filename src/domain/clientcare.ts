/**
 * Cuidado com cada cliente: onboarding (checklist do começo), briefing,
 * arquivos, onde estão os acessos, contratos com vencimento, origem e
 * indicações.
 */
import { addDays, diffInDays, isValidISODate, type ISODate } from '../core/dates.ts';
import { createId } from '../core/id.ts';
import { logActivity } from './activity.ts';
import { WON_STAGE } from './labels.ts';
import type { ActionContext } from './operations.ts';
import type { AppData, Client, ClientAccess, ContractKind, ContractRecord, ID, StoredFile } from './types.ts';

function findClient(draft: AppData, id: ID): Client {
  const client = draft.clients.find((c) => c.id === id);
  if (!client) throw new Error('Cliente não encontrado.');
  return client;
}

// ---------------------------------------------------------------- Onboarding

export const ONBOARDING_STEPS: Array<{ key: string; label: string; hint: string }> = [
  { key: 'contrato', label: 'Contrato assinado', hint: 'PDF assinado guardado nos Arquivos.' },
  { key: 'entrada', label: 'Entrada (50%) paga', hint: 'Marque a parcela como paga em Pagamentos.' },
  { key: 'briefing', label: 'Briefing respondido', hint: 'Respostas salvas na aba Briefing.' },
  { key: 'materiais', label: 'Logo, fotos e textos recebidos', hint: 'Guarde nos Arquivos do cliente.' },
  { key: 'dominio', label: 'Acesso ao domínio combinado', hint: 'Registro.br no nome do cliente, anotado em Acessos.' },
  { key: 'grupo', label: 'Grupo ou conversa do projeto criado', hint: 'Um lugar só para falar do projeto.' },
];

export function onboardingOf(client: Client): Array<{ key: string; label: string; hint: string; doneOn: ISODate | null }> {
  return ONBOARDING_STEPS.map((s) => ({ ...s, doneOn: client.onboarding?.[s.key] ?? null }));
}

export function onboardingProgress(client: Client): { done: number; total: number } {
  const steps = onboardingOf(client);
  return { done: steps.filter((s) => s.doneOn).length, total: steps.length };
}

/** Cliente ainda no começo: contrato ativo, nenhum projeto entregue e onboarding incompleto. */
export function inOnboarding(data: AppData, client: Client): boolean {
  if (client.contractStatus === 'concluido' || client.contractStatus === 'pausado') return false;
  if (data.projects.some((p) => p.clientId === client.id && p.status === 'publicado')) return false;
  const p = onboardingProgress(client);
  return p.done < p.total;
}

export function toggleOnboarding(draft: AppData, clientId: ID, key: string, today: ISODate): void {
  if (!ONBOARDING_STEPS.some((s) => s.key === key)) throw new Error('Passo do onboarding não encontrado.');
  const client = findClient(draft, clientId);
  const map = { ...(client.onboarding ?? {}) };
  if (map[key]) delete map[key];
  else map[key] = today;
  client.onboarding = map;
}

// ---------------------------------------------------------------- Briefing

export const DEFAULT_BRIEFING: Array<{ id: ID; text: string }> = [
  { id: 'bq_negocio', text: 'Conte sobre o negócio: o que vende ou faz, há quanto tempo e o que tem de diferente.' },
  { id: 'bq_publico', text: 'Quem é o cliente ideal? (idade, região, o que procura)' },
  { id: 'bq_objetivo', text: 'Qual é o principal objetivo do site? (mais mensagens no WhatsApp, pedidos, agendamentos...)' },
  { id: 'bq_secoes', text: 'O que precisa aparecer no site? (serviços, cardápio, fotos, depoimentos, localização, horários)' },
  { id: 'bq_cores', text: 'Cores, logo e estilo: já tem? Do que gosta e do que não gosta?' },
  { id: 'bq_referencias', text: 'Sites ou perfis que você admira (links).' },
  { id: 'bq_concorrentes', text: 'Principais concorrentes.' },
  { id: 'bq_contato', text: 'WhatsApp, Instagram, e-mail e endereço que vão no site.' },
  { id: 'bq_dominio', text: 'Já tem domínio (www)? Qual nome prefere?' },
  { id: 'bq_prazo', text: 'Tem alguma data importante para o site estar no ar?' },
];

export function briefingQuestions(data: AppData): Array<{ id: ID; text: string }> {
  return data.briefingQuestions?.length ? data.briefingQuestions : DEFAULT_BRIEFING;
}

export function saveBriefing(draft: AppData, clientId: ID, answers: Record<string, string>, ctx: ActionContext): void {
  const client = findClient(draft, clientId);
  const clean: Record<string, string> = {};
  for (const q of briefingQuestions(draft)) {
    const value = (answers[q.id] ?? '').trim();
    if (value) clean[q.id] = value.slice(0, 4000);
  }
  client.briefing = { answers: clean, updatedAt: ctx.now.toISOString() };
  // Briefing com metade ou mais das respostas marca o passo do onboarding.
  if (Object.keys(clean).length >= Math.ceil(briefingQuestions(draft).length / 2) && !client.onboarding?.briefing) {
    client.onboarding = { ...(client.onboarding ?? {}), briefing: ctx.now.toISOString().slice(0, 10) };
  }
  logActivity(draft, ctx, `atualizou o briefing de ${client.company}`, `#/clientes/${client.id}/briefing`);
}

export function saveBriefingQuestions(draft: AppData, lines: string[]): void {
  const texts = lines.map((l) => l.trim()).filter(Boolean);
  if (!texts.length) throw new Error('Deixe pelo menos uma pergunta.');
  const current = briefingQuestions(draft);
  // Mantém o id das perguntas que não mudaram (as respostas continuam ligadas).
  draft.briefingQuestions = texts.map((text, i) => current.find((q) => q.text === text) ?? { id: `bq_${i}_${text.length}_${text.slice(0, 12).replace(/\W+/g, '').toLowerCase()}`, text });
}

// ---------------------------------------------------------------- Arquivos

export const FILE_CATEGORIES = ['Logo e identidade', 'Fotos', 'Textos', 'Contrato', 'Comprovantes', 'Outros'];

export function addClientFile(draft: AppData, clientId: ID, file: Omit<StoredFile, 'id' | 'uploadedAt' | 'authorId'>, ctx: ActionContext): StoredFile {
  const client = findClient(draft, clientId);
  const stored: StoredFile = { ...file, category: FILE_CATEGORIES.includes(file.category) ? file.category : 'Outros', id: createId('arq'), uploadedAt: ctx.now.toISOString(), authorId: ctx.userId };
  client.files = [...(client.files ?? []), stored];
  logActivity(draft, ctx, `guardou um arquivo de ${client.company}`, `#/clientes/${client.id}/arquivos`);
  return stored;
}

/** Remove o registro e devolve o arquivo (para apagar do armazenamento). */
export function removeClientFile(draft: AppData, clientId: ID, fileId: ID): StoredFile | null {
  const client = findClient(draft, clientId);
  const file = (client.files ?? []).find((f) => f.id === fileId) ?? null;
  client.files = (client.files ?? []).filter((f) => f.id !== fileId);
  return file;
}

export function findClientFile(data: AppData, fileId: ID): StoredFile | undefined {
  for (const c of data.clients) {
    const f = (c.files ?? []).find((x) => x.id === fileId);
    if (f) return f;
  }
  return undefined;
}

// ---------------------------------------------------------------- Acessos

export const ACCESS_SERVICES = ['Domínio (Registro.br)', 'Hospedagem', 'Instagram', 'Facebook', 'Google Meu Negócio', 'E-mail', 'WhatsApp Business', 'Outro'];

/** Palavras que indicam que alguém tentou colar uma senha. */
const PASSWORD_HINT = /(senha|password|pass|pwd)\s*[:=]/i;

export function saveAccess(draft: AppData, clientId: ID, id: ID | null, input: Omit<ClientAccess, 'id'>): ClientAccess {
  const client = findClient(draft, clientId);
  const fields = {
    service: input.service.trim(),
    login: input.login.trim(),
    whereSaved: input.whereSaved.trim(),
    whoHasAccess: input.whoHasAccess.trim(),
    url: input.url.trim(),
    notes: input.notes.trim(),
  };
  if (!fields.service) throw new Error('Escolha qual conta é.');
  if (Object.values(fields).some((v) => PASSWORD_HINT.test(v))) throw new Error('Não guarde senhas aqui. Anote só onde a senha está guardada (ex.: Bitwarden).');
  client.accesses ??= [];
  if (id) {
    const access = client.accesses.find((a) => a.id === id);
    if (!access) throw new Error('Acesso não encontrado.');
    Object.assign(access, fields);
    return access;
  }
  const access: ClientAccess = { id: createId('ace'), ...fields };
  client.accesses.push(access);
  return access;
}

export function removeAccess(draft: AppData, clientId: ID, id: ID): void {
  const client = findClient(draft, clientId);
  client.accesses = (client.accesses ?? []).filter((a) => a.id !== id);
}

// ---------------------------------------------------------------- Contratos e vencimentos

export const CONTRACT_KINDS: Array<{ value: ContractKind; label: string }> = [
  { value: 'site', label: 'Criação de site' },
  { value: 'manutencao', label: 'Manutenção mensal' },
  { value: 'dominio', label: 'Domínio' },
  { value: 'hospedagem', label: 'Hospedagem' },
  { value: 'outro', label: 'Outro' },
];

/** Avisa com esta antecedência antes de um contrato vencer. */
export const CONTRACT_WARNING_DAYS = 30;

export type ContractState = 'ativo' | 'vencendo' | 'vencido' | 'sem_fim';

export function contractState(c: Pick<ContractRecord, 'endDate'>, today: ISODate): ContractState {
  if (!c.endDate) return 'sem_fim';
  if (c.endDate < today) return 'vencido';
  if (diffInDays(today, c.endDate) <= CONTRACT_WARNING_DAYS) return 'vencendo';
  return 'ativo';
}

export const CONTRACT_STATE_LABELS: Record<ContractState, { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  ativo: { label: 'Ativo', tone: 'success' },
  vencendo: { label: 'Vence logo', tone: 'warning' },
  vencido: { label: 'Vencido', tone: 'danger' },
  sem_fim: { label: 'Sem data de fim', tone: 'neutral' },
};

export interface ContractInput {
  clientId: ID;
  title: string;
  kind: ContractKind;
  startDate: ISODate;
  endDate: ISODate | null;
  amount: number | null;
  recurrence: ContractRecord['recurrence'];
  signed: boolean;
  link: string;
  notes: string;
}

export function saveContract(draft: AppData, id: ID | null, input: ContractInput, ctx: ActionContext): ContractRecord {
  if (!draft.clients.some((c) => c.id === input.clientId)) throw new Error('Escolha o cliente.');
  const title = input.title.trim() || CONTRACT_KINDS.find((k) => k.value === input.kind)?.label || 'Contrato';
  if (!isValidISODate(input.startDate)) throw new Error('Informe o início do contrato.');
  if (input.endDate && !isValidISODate(input.endDate)) throw new Error('Data de fim inválida.');
  if (input.endDate && input.endDate < input.startDate) throw new Error('O fim não pode ser antes do início.');
  if (input.amount !== null && !(input.amount >= 0)) throw new Error('Valor inválido.');
  const fields = { clientId: input.clientId, title, kind: input.kind, startDate: input.startDate, endDate: input.endDate, amount: input.amount, recurrence: input.recurrence, signed: input.signed, link: input.link.trim(), notes: input.notes.trim() };
  draft.contracts ??= [];
  if (id) {
    const contract = draft.contracts.find((c) => c.id === id);
    if (!contract) throw new Error('Contrato não encontrado.');
    Object.assign(contract, fields);
    return contract;
  }
  const contract: ContractRecord = { id: createId('ctr'), ...fields, createdAt: ctx.now.toISOString() };
  draft.contracts.push(contract);
  const client = draft.clients.find((c) => c.id === input.clientId)!;
  logActivity(draft, ctx, `registrou o contrato "${title}" de ${client.company}`, '#/contratos');
  return contract;
}

export function deleteContract(draft: AppData, id: ID): void {
  draft.contracts = (draft.contracts ?? []).filter((c) => c.id !== id);
}

/** Renova: o novo período começa no dia seguinte ao fim e dura o mesmo tempo. */
export function renewContract(draft: AppData, id: ID): ContractRecord {
  const contract = (draft.contracts ?? []).find((c) => c.id === id);
  if (!contract || !contract.endDate) throw new Error('Só dá para renovar contratos com data de fim.');
  const length = Math.max(1, diffInDays(contract.startDate, contract.endDate));
  contract.startDate = addDays(contract.endDate, 1);
  contract.endDate = addDays(contract.startDate, length);
  return contract;
}

/** Contratos ordenados: vencidos e vencendo primeiro. */
export function sortedContracts(data: AppData, today: ISODate, clientId?: ID): ContractRecord[] {
  const weight: Record<ContractState, number> = { vencido: 0, vencendo: 1, ativo: 2, sem_fim: 3 };
  return (data.contracts ?? [])
    .filter((c) => !clientId || c.clientId === clientId)
    .sort((a, b) => weight[contractState(a, today)] - weight[contractState(b, today)] || (a.endDate ?? '9999').localeCompare(b.endDate ?? '9999'));
}

export function contractsEndingSoon(data: AppData, today: ISODate): ContractRecord[] {
  return sortedContracts(data, today).filter((c) => {
    const s = contractState(c, today);
    return s === 'vencendo' || s === 'vencido';
  });
}

// ---------------------------------------------------------------- Origem e indicações

export const CLIENT_SOURCES = ['Google Maps', 'Instagram', 'Indicação', 'Anúncio', 'Site da Mawe', 'Outro'];

/** De onde o cliente veio: o que foi anotado nele ou a origem do lead que virou cliente. */
export function clientSource(data: AppData, client: Client): string {
  if (client.source) return client.source;
  if (client.referredBy || client.referredByName) return 'Indicação';
  const opp = data.opportunities.find((o) => o.clientId === client.id || (o.stage === WON_STAGE && o.company === client.company));
  return opp?.source || 'Não informado';
}

export function saveClientOrigin(draft: AppData, clientId: ID, input: { source: string; referredBy: ID | null; referredByName: string }): void {
  const client = findClient(draft, clientId);
  if (input.referredBy === clientId) throw new Error('O cliente não pode ter indicado a si mesmo.');
  if (input.referredBy && !draft.clients.some((c) => c.id === input.referredBy)) throw new Error('Cliente que indicou não encontrado.');
  client.source = input.source.trim() || null;
  client.referredBy = input.referredBy;
  client.referredByName = input.referredBy ? '' : input.referredByName.trim();
  if ((client.referredBy || client.referredByName) && !client.source) client.source = 'Indicação';
}

/** Quem indicou quem: cada cliente que indicou e as indicações dele. */
export function referrals(data: AppData): Array<{ who: string; whoId: ID | null; referred: Client[] }> {
  const map = new Map<string, { who: string; whoId: ID | null; referred: Client[] }>();
  for (const c of data.clients) {
    if (!c.referredBy && !c.referredByName) continue;
    const by = c.referredBy ? data.clients.find((x) => x.id === c.referredBy) : null;
    const key = by ? by.id : `nome:${c.referredByName}`;
    const row = map.get(key) ?? { who: by?.company ?? c.referredByName ?? '', whoId: by?.id ?? null, referred: [] };
    row.referred.push(c);
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.referred.length - a.referred.length || a.who.localeCompare(b.who, 'pt-BR'));
}

// ---------------------------------------------------------------- A a Z

/** Primeira letra para o índice (sem acento; números e símbolos em "#"). */
export function indexLetter(name: string): string {
  const first = name.trim().normalize('NFD').replace(/[̀-ͯ]/g, '').charAt(0).toUpperCase();
  return /[A-Z]/.test(first) ? first : '#';
}

export function clientsAZ(data: AppData): Array<{ letter: string; clients: Client[] }> {
  const sorted = [...data.clients].sort((a, b) => a.company.localeCompare(b.company, 'pt-BR', { sensitivity: 'base' }));
  const groups: Array<{ letter: string; clients: Client[] }> = [];
  for (const c of sorted) {
    const letter = indexLetter(c.company);
    const last = groups.at(-1);
    if (last && last.letter === letter) last.clients.push(c);
    else groups.push({ letter, clients: [c] });
  }
  // "#" vai para o fim.
  return [...groups.filter((g) => g.letter !== '#'), ...groups.filter((g) => g.letter === '#')];
}
