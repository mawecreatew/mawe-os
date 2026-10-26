/**
 * Roteador por hash: `#/comercial/opp_123` → { section: 'comercial', params: ['opp_123'] }.
 * Funciona com qualquer servidor estático, sem configuração extra.
 */

export interface Route {
  section: string;
  params: string[];
}

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  return { section: parts[0] ?? 'painel', params: parts.slice(1) };
}

export function currentRoute(): Route {
  return parseHash(window.location.hash);
}

export function navigate(path: string): void {
  window.location.hash = path.startsWith('#') ? path : `#${path}`;
}
