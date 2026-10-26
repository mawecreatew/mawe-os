// Supabase SIMULADO, usado apenas nos testes automatizados (npm run test:e2e).
// Imita os endereços de login e de dados que o Mawe OS usa, com as mesmas
// regras do supabase/schema.sql: só membros leem/gravam e há controle de versão.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

export const FAKE_ANON_KEY = 'chave-publica-de-teste';

export const FAKE_USERS = {
  'maria@example.com': { id: '11111111-1111-1111-1111-111111111111', password: 'senha-da-maria-123', member: { app_user_id: 'maria', name: 'Maria Eduarda', role: 'socio' } },
  'wesley@example.com': { id: '22222222-2222-2222-2222-222222222222', password: 'senha-do-wesley-123', member: { app_user_id: 'wesley', name: 'Wesley', role: 'socio' } },
  'intruso@example.com': { id: '33333333-3333-3333-3333-333333333333', password: 'senha-do-intruso-123', member: null },
};

export function startFakeSupabase(port) {
  const users = structuredClone(FAKE_USERS);
  const tokens = new Map(); // access token -> e-mail
  const refreshTokens = new Map(); // refresh token -> e-mail
  const workspace = { id: 'main', data: null, version: 0 };

  const issue = (email) => {
    const access = randomUUID();
    const refresh = randomUUID();
    tokens.set(access, email);
    refreshTokens.set(refresh, email);
    return { access_token: access, refresh_token: refresh, token_type: 'bearer', expires_in: 3600, user: { id: users[email].id, email } };
  };

  const server = createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'apikey, authorization, content-type, prefer',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, OPTIONS',
      });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return send(204);
    if (req.headers.apikey !== FAKE_ANON_KEY) return send(401, { message: 'Invalid API key' });

    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};
    const url = new URL(req.url, 'http://x');
    const bearer = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    const email = tokens.get(bearer);
    const member = email ? users[email].member : null;

    if (url.pathname === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') {
        const user = users[body.email];
        if (!user || user.password !== body.password) return send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
        return send(200, issue(body.email));
      }
      const owner = refreshTokens.get(body.refresh_token);
      if (!owner) return send(400, { error_code: 'refresh_token_not_found' });
      refreshTokens.delete(body.refresh_token);
      return send(200, issue(owner));
    }
    if (url.pathname === '/auth/v1/logout') {
      tokens.delete(bearer);
      return send(204);
    }
    if (url.pathname === '/auth/v1/user' && req.method === 'PUT') {
      if (!email) return send(401, { msg: 'JWT expired' });
      if (String(body.password ?? '').length < 6) return send(422, { error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
      users[email].password = body.password;
      return send(200, { id: users[email].id, email });
    }

    // API de dados: exige login; regras equivalentes ao RLS do schema.sql
    if (!email) return send(401, { message: 'JWT expired' });
    if (url.pathname === '/rest/v1/members') {
      if (!member) return send(200, []);
      const uid = url.searchParams.get('user_id')?.replace('eq.', '');
      const rows = Object.values(users).filter((u) => u.member && (!uid || u.id === uid)).map((u) => ({ ...u.member }));
      return send(200, rows);
    }
    if (url.pathname === '/rest/v1/workspace') {
      if (!member) return send(200, []);
      if (req.method === 'GET') return send(200, [{ data: workspace.data, version: workspace.version }]);
      if (req.method === 'PATCH') {
        const expected = Number(url.searchParams.get('version')?.replace('eq.', ''));
        if (expected !== workspace.version) return send(200, []);
        if (body.version !== workspace.version + 1) return send(400, { message: 'Conflito de versão' });
        workspace.data = body.data;
        workspace.version = body.version;
        return send(200, [{ id: 'main', version: workspace.version }]);
      }
    }
    send(404, { message: 'not found' });
  });

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, workspace, users })));
}
