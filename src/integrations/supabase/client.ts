/**
 * Cliente mínimo do Supabase (autenticação + API REST), usando apenas `fetch`.
 *
 * Faz o mesmo que a parte usada da biblioteca oficial `@supabase/supabase-js`:
 * login com e-mail e senha, renovação automática da sessão, saída, troca de
 * senha e chamadas à API de dados com o token do usuário.
 */
import type { SupabaseConfig } from './config.ts';

export interface Session {
  accessToken: string;
  refreshToken: string;
  /** Momento (em segundos desde 1970) em que o token de acesso expira. */
  expiresAt: number;
  user: { id: string; email: string };
}

export interface Member {
  appUserId: string;
  name: string;
  role: string;
}

/** Sessão inexistente ou expirada: é preciso entrar novamente. */
export class AuthRequiredError extends Error {
  constructor(message = 'Sua sessão expirou. Entre novamente.') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const SESSION_KEY = 'mawe-os:sessao';
/** Renova o token um pouco antes de expirar. */
const REFRESH_MARGIN_SECONDS = 60;

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
  user: { id: string; email?: string };
}

function toSession(body: TokenResponse, nowSeconds: number): Session {
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: body.expires_at ?? nowSeconds + body.expires_in,
    user: { id: body.user.id, email: body.user.email ?? '' },
  };
}

/** Traduz erros do Supabase para mensagens claras em português. */
export function authErrorMessage(status: number, body: Record<string, unknown> | null): string {
  const code = String(body?.error_code ?? body?.code ?? body?.error ?? '');
  const text = String(body?.msg ?? body?.error_description ?? body?.message ?? '');
  if (status === 429 || code === 'over_request_rate_limit') return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.';
  if (code === 'invalid_credentials' || code === 'invalid_grant' || /invalid login credentials/i.test(text)) return 'E-mail ou senha incorretos.';
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(text)) return 'Este e-mail ainda não foi confirmado no Supabase.';
  if (code === 'weak_password' || /password should be/i.test(text)) return 'Senha fraca. Use pelo menos 10 caracteres, misturando letras e números.';
  if (code === 'same_password') return 'A nova senha precisa ser diferente da atual.';
  if (code === 'reauthentication_needed') return 'Por segurança, saia e entre novamente antes de trocar a senha.';
  if (status >= 500) return 'O Supabase está indisponível no momento. Tente novamente em instantes.';
  return text || `Erro inesperado do Supabase (${status}).`;
}

export class SupabaseClient {
  readonly config: SupabaseConfig;
  private readonly fetchFn: typeof fetch;
  private readonly storage: KeyValueStorage;
  private readonly now: () => number;
  private session: Session | null = null;
  private refreshing: Promise<Session> | null = null;

  constructor(config: SupabaseConfig, options: { fetch?: typeof fetch; storage: KeyValueStorage; now?: () => number }) {
    this.config = config;
    this.fetchFn = options.fetch ?? ((...args) => fetch(...args));
    this.storage = options.storage;
    this.now = options.now ?? (() => Math.floor(Date.now() / 1000));
  }

  get currentSession(): Session | null {
    return this.session;
  }

  private async call(path: string, init: RequestInit & { token?: string } = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('apikey', this.config.supabaseAnonKey);
    if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
    if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    try {
      return await this.fetchFn(`${this.config.supabaseUrl}${path}`, { ...init, headers });
    } catch {
      throw new Error('Não foi possível conectar ao Supabase. Verifique sua internet.');
    }
  }

  private persist(session: Session | null): void {
    this.session = session;
    if (session) this.storage.setItem(SESSION_KEY, JSON.stringify(session));
    else this.storage.removeItem(SESSION_KEY);
  }

  private async tokenRequest(grant: 'password' | 'refresh_token', body: object): Promise<Session> {
    const response = await this.call(`/auth/v1/token?grant_type=${grant}`, { method: 'POST', body: JSON.stringify(body) });
    const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || !json?.access_token) {
      if (grant === 'refresh_token') throw new AuthRequiredError();
      throw new Error(authErrorMessage(response.status, json));
    }
    const session = toSession(json as unknown as TokenResponse, this.now());
    this.persist(session);
    return session;
  }

  async signIn(email: string, password: string): Promise<Session> {
    if (!email.trim() || !password) throw new Error('Informe e-mail e senha.');
    return this.tokenRequest('password', { email: email.trim().toLowerCase(), password });
  }

  /** Recupera a sessão salva neste navegador, renovando se necessário. Null se não houver. */
  async restoreSession(): Promise<Session | null> {
    const saved = this.storage.getItem(SESSION_KEY);
    if (!saved) return null;
    try {
      this.session = JSON.parse(saved) as Session;
      return await this.validSession();
    } catch {
      this.persist(null);
      return null;
    }
  }

  /** Devolve uma sessão válida, renovando o token quando está perto de expirar. */
  async validSession(): Promise<Session> {
    if (!this.session) throw new AuthRequiredError('Você precisa entrar para continuar.');
    if (this.session.expiresAt - REFRESH_MARGIN_SECONDS > this.now()) return this.session;
    return this.refresh();
  }

  private refresh(): Promise<Session> {
    if (!this.session) return Promise.reject(new AuthRequiredError());
    // Evita duas renovações em paralelo com o mesmo token.
    this.refreshing ??= this.tokenRequest('refresh_token', { refresh_token: this.session.refreshToken })
      .catch((error) => {
        this.persist(null);
        throw error;
      })
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  async signOut(): Promise<void> {
    const token = this.session?.accessToken;
    this.persist(null);
    if (token) await this.call('/auth/v1/logout', { method: 'POST', token }).catch(() => undefined);
  }

  async changePassword(newPassword: string): Promise<void> {
    const session = await this.validSession();
    const response = await this.call('/auth/v1/user', { method: 'PUT', token: session.accessToken, body: JSON.stringify({ password: newPassword }) });
    if (!response.ok) {
      const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      throw new Error(authErrorMessage(response.status, json));
    }
  }

  /**
   * Chamada autenticada à API de dados (PostgREST).
   * Se o token for recusado, renova uma vez e tenta de novo.
   */
  async rest(path: string, init: RequestInit = {}): Promise<Response> {
    let session = await this.validSession();
    let response = await this.call(`/rest/v1/${path}`, { ...init, token: session.accessToken });
    if (response.status === 401) {
      session = await this.refresh();
      response = await this.call(`/rest/v1/${path}`, { ...init, token: session.accessToken });
      if (response.status === 401) {
        this.persist(null);
        throw new AuthRequiredError();
      }
    }
    return response;
  }

  /** Perfil do Mawe OS ligado à conta (tabela `members`). Null se a conta não tiver acesso. */
  async fetchMember(): Promise<Member | null> {
    const session = await this.validSession();
    const response = await this.rest(`members?select=app_user_id,name,role&user_id=eq.${encodeURIComponent(session.user.id)}`);
    if (!response.ok) throw new Error(`Não foi possível ler o perfil (erro ${response.status}).`);
    const rows = (await response.json()) as Array<{ app_user_id: string; name: string; role: string }>;
    const row = rows[0];
    return row ? { appUserId: row.app_user_id, name: row.name, role: row.role } : null;
  }
}
