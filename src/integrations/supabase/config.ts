/**
 * Configuração do Supabase, lida de `public/config.json` (arquivo fora do Git).
 *
 * Contém apenas o endereço do projeto e a chave PÚBLICA (anon/publishable),
 * que foi feita para ficar no navegador. A segurança vem do login e das regras
 * de acesso (RLS) configuradas no banco — veja docs/SUPABASE.md.
 * Nunca coloque aqui a chave `service_role`/`secret`.
 */

export interface SupabaseConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export const CONFIG_PATH = 'public/config.json';

export function parseSupabaseConfig(value: unknown): SupabaseConfig {
  const v = value as Partial<SupabaseConfig> | null;
  const url = typeof v?.supabaseUrl === 'string' ? v.supabaseUrl.trim().replace(/\/+$/, '') : '';
  const key = typeof v?.supabaseAnonKey === 'string' ? v.supabaseAnonKey.trim() : '';
  if (!url || !key || url.includes('SEU-PROJETO') || key.includes('COLE-AQUI')) {
    throw new Error('O arquivo public/config.json existe, mas ainda não foi preenchido.');
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('O endereço do Supabase em public/config.json não é válido.');
  }
  const isLocalTest = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  if (parsed.protocol !== 'https:' && !isLocalTest) {
    throw new Error('O endereço do Supabase precisa começar com https://');
  }
  if (/service_role|sb_secret_/.test(key) || jwtRole(key) === 'service_role') {
    throw new Error('A chave em public/config.json é a chave SECRETA. Use a chave pública (anon / publishable).');
  }
  return { supabaseUrl: url, supabaseAnonKey: key };
}

/** Lê o papel de uma chave JWT antiga (anon/service_role), sem validar assinatura. */
function jwtRole(key: string): string | null {
  const payload = key.split('.')[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.role === 'string' ? json.role : null;
  } catch {
    return null;
  }
}

/** Retorna null quando o arquivo não existe (modo protótipo local). */
export async function loadSupabaseConfig(fetchFn: typeof fetch = fetch): Promise<SupabaseConfig | null> {
  const response = await fetchFn(CONFIG_PATH, { cache: 'no-store' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Não foi possível ler ${CONFIG_PATH} (erro ${response.status}).`);
  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new Error('O arquivo public/config.json não é um JSON válido. Confira vírgulas e aspas.');
  }
  return parseSupabaseConfig(json);
}
