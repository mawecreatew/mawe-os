/** Acesso global ao store e a informações da sessão, usados pelas telas. */
import { todayISO } from '../core/dates.ts';
import type { Store } from '../data/store.ts';
import { can, type Permission } from '../domain/permissions.ts';

let instance: Store | null = null;

export function setStore(store: Store): void {
  instance = store;
}

export function store(): Store {
  if (!instance) throw new Error('Store ainda não inicializado.');
  return instance;
}

export function today(): string {
  return todayISO(store().now());
}

export function allowed(permission: Permission): boolean {
  return can(store().currentUser, permission);
}

/** Lança erro se o perfil ativo não tiver a permissão (usado antes de alterações). */
export function requirePermission(permission: Permission): void {
  if (!allowed(permission)) throw new Error('Seu perfil não tem permissão para esta ação.');
}

export interface BrandAssets {
  logoHorizontal: string | null;
  monogram: string | null;
}

export const brandAssets: BrandAssets = { logoHorizontal: null, monogram: null };

let renderer: () => void = () => {};

export function setRenderer(fn: () => void): void {
  renderer = fn;
}

/** Redesenha a tela atual (usado quando muda um filtro, que não é dado salvo). */
export function rerender(): void {
  renderer();
}

/**
 * Modo de acesso:
 * - `local`: protótipo sem login (dados neste navegador, perfil trocável);
 * - `supabase`: login real; dados compartilhados; perfil definido pela conta.
 */
export type AuthState =
  | { mode: 'local' }
  | { mode: 'supabase'; client: import('../integrations/supabase/client.ts').SupabaseClient; email: string };

let authState: AuthState = { mode: 'local' };

export function setAuth(state: AuthState): void {
  authState = state;
}

export function auth(): AuthState {
  return authState;
}
