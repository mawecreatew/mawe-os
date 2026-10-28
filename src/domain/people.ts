/**
 * Responsáveis: tarefas, projetos e oportunidades podem ter uma ou mais pessoas.
 *
 * Além dos sócios (que fazem login), dá para cadastrar pessoas extras — um
 * freelancer, um ajudante — só para receber tarefas. Elas ficam marcadas com
 * `guest: true` e não têm acesso ao sistema.
 */
import { createId } from '../core/id.ts';
import { fillDefaults } from './normalize.ts';
import type { AppData, ID, User } from './types.ts';

/** Prefixo usado no formulário para uma pessoa digitada que ainda não existe. */
export const NEW_PERSON_PREFIX = 'nova:';

/** Pessoas que podem ser escolhidas como responsáveis (sócios primeiro). */
export function assignableUsers(data: AppData): User[] {
  return [...data.users].sort((a, b) => Number(Boolean(a.guest)) - Number(Boolean(b.guest)));
}

/** Pessoas que fazem login (perfis do sistema). */
export function teamMembers(data: AppData): User[] {
  return data.users.filter((u) => !u.guest);
}

export function hasPerson(ids: readonly ID[] | undefined, userId: ID): boolean {
  return Boolean(ids?.includes(userId));
}

/** "Maria", "Maria e Wesley", "Maria, Wesley e Ana". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
}

export function peopleNames(data: AppData, ids: readonly ID[] | undefined, fallback = 'Sem responsável'): string {
  const names = (ids ?? []).map((id) => data.users.find((u) => u.id === id)?.shortName).filter((n): n is string => Boolean(n));
  return names.length ? joinNames(names) : fallback;
}

function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, 40);
}

function shortNameOf(name: string): string {
  return name.split(' ')[0];
}

/** Cadastra uma pessoa extra (ou devolve a existente com o mesmo nome). */
export function addPerson(draft: AppData, rawName: string): User {
  const name = cleanName(rawName);
  if (!name) throw new Error('Digite o nome da pessoa.');
  const existing = draft.users.find((u) => u.name.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
  if (existing) return existing;
  const user: User = { id: createId('pes'), name, shortName: shortNameOf(name), role: 'colaborador', title: 'Sem login', guest: true };
  draft.users.push(user);
  return user;
}

/**
 * Transforma o que veio do formulário em IDs válidos: cria as pessoas novas
 * (`nova:Nome`), ignora IDs que não existem e remove repetidos.
 */
export function resolvePeople(draft: AppData, values: readonly string[]): ID[] {
  const ids: ID[] = [];
  for (const value of values) {
    const id = value.startsWith(NEW_PERSON_PREFIX)
      ? addPerson(draft, value.slice(NEW_PERSON_PREFIX.length)).id
      : draft.users.some((u) => u.id === value)
        ? value
        : null;
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

/**
 * Remove uma pessoa extra. Ela sai das tarefas, projetos e oportunidades; quem
 * ficaria sem responsável passa para `fallbackId` (normalmente quem removeu).
 */
export function removePerson(draft: AppData, userId: ID, fallbackId: ID): void {
  const user = draft.users.find((u) => u.id === userId);
  if (!user) throw new Error('Pessoa não encontrada.');
  if (!user.guest) throw new Error('Sócios só podem ser removidos pelo painel do Supabase.');
  const strip = (ids: ID[]) => {
    const rest = ids.filter((id) => id !== userId);
    return rest.length ? rest : [fallbackId];
  };
  for (const t of draft.tasks) t.assigneeIds = strip(t.assigneeIds);
  for (const p of draft.projects) p.ownerIds = strip(p.ownerIds);
  for (const o of draft.opportunities) o.ownerIds = strip(o.ownerIds);
  draft.users = draft.users.filter((u) => u.id !== userId);
}

type Legacy = { assigneeId?: ID; assigneeIds?: ID[]; ownerId?: ID; ownerIds?: ID[] };

function upgrade(item: Legacy, single: 'assigneeId' | 'ownerId', list: 'assigneeIds' | 'ownerIds'): void {
  if (!Array.isArray(item[list])) item[list] = item[single] ? [item[single]!] : [];
  delete item[single];
}

/**
 * Converte dados salvos por versões anteriores para o formato atual (lista de
 * responsáveis e campos novos). Pode ser chamada quantas vezes for preciso.
 */
export function normalizeData(data: AppData): AppData {
  for (const t of data.tasks as unknown as Legacy[]) upgrade(t, 'assigneeId', 'assigneeIds');
  for (const p of data.projects as unknown as Legacy[]) upgrade(p, 'ownerId', 'ownerIds');
  for (const o of data.opportunities as unknown as Legacy[]) upgrade(o, 'ownerId', 'ownerIds');
  return fillDefaults(data);
}
