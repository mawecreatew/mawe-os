/**
 * Atividade da equipe: um registro curto do que cada pessoa fez
 * ("Maria registrou contato com Haltere"). Guarda só as últimas ações para
 * não pesar nos dados compartilhados.
 */
import { createId } from '../core/id.ts';
import type { ActionContext } from './operations.ts';
import type { ActivityEntry, AppData, ID } from './types.ts';

export const ACTIVITY_LIMIT = 300;

export function logActivity(draft: AppData, ctx: ActionContext, text: string, href = ''): void {
  const list = draft.activity ?? [];
  list.push({ id: createId('act'), at: ctx.now.toISOString(), userId: ctx.userId, text, href });
  draft.activity = list.length > ACTIVITY_LIMIT ? list.slice(-ACTIVITY_LIMIT) : list;
}

/** Mais recentes primeiro. */
export function recentActivity(data: AppData, limit = 20, userId?: ID): ActivityEntry[] {
  const list = (data.activity ?? []).filter((a) => !userId || a.userId === userId);
  return list.slice(-limit).reverse();
}
