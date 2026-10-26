import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { after, before, describe, it } from 'node:test';
import { FAKE_ANON_KEY, startFakeSupabase } from '../scripts/fake-supabase.mjs';
import { Store } from '../src/data/store.ts';
import { createTask } from '../src/domain/operations.ts';
import { SupabaseClient } from '../src/integrations/supabase/client.ts';
import { parseSupabaseConfig, type SupabaseConfig } from '../src/integrations/supabase/config.ts';
import { ConflictError, SupabaseDataSource } from '../src/integrations/supabase/data-source.ts';

const PORT = 54_391;
const config: SupabaseConfig = { supabaseUrl: `http://127.0.0.1:${PORT}`, supabaseAnonKey: FAKE_ANON_KEY };
let server: Server;

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map };
}

async function loggedClient(email: string, password: string, storage = memoryStorage()) {
  const client = new SupabaseClient(config, { storage });
  await client.signIn(email, password);
  return client;
}

const MARIA = ['maria@example.com', 'senha-da-maria-123'] as const;
const WESLEY = ['wesley@example.com', 'senha-do-wesley-123'] as const;
const clock = () => new Date(2026, 9, 26, 9);

before(async () => {
  ({ server } = await startFakeSupabase(PORT));
});
after(() => server.close());

describe('configuração do Supabase', () => {
  it('aceita endereço https e chave pública', () => {
    assert.deepEqual(parseSupabaseConfig({ supabaseUrl: 'https://abc.supabase.co/', supabaseAnonKey: 'sb_publishable_x' }), {
      supabaseUrl: 'https://abc.supabase.co',
      supabaseAnonKey: 'sb_publishable_x',
    });
  });

  it('recusa arquivo não preenchido, endereço sem https e chave secreta', () => {
    assert.throws(() => parseSupabaseConfig({ supabaseUrl: 'https://SEU-PROJETO.supabase.co', supabaseAnonKey: 'COLE-AQUI-A-CHAVE-PUBLICA' }), /não foi preenchido/);
    assert.throws(() => parseSupabaseConfig({ supabaseUrl: 'http://abc.supabase.co', supabaseAnonKey: 'k' }), /https/);
    assert.throws(() => parseSupabaseConfig({ supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: 'sb_secret_abc' }), /SECRETA/);
    const fakeServiceJwt = `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.y`;
    assert.throws(() => parseSupabaseConfig({ supabaseUrl: 'https://abc.supabase.co', supabaseAnonKey: fakeServiceJwt }), /SECRETA/);
  });
});

describe('login', () => {
  it('recusa senha errada com mensagem clara', async () => {
    const client = new SupabaseClient(config, { storage: memoryStorage() });
    await assert.rejects(() => client.signIn('maria@example.com', 'errada'), /E-mail ou senha incorretos/);
  });

  it('entra, lembra a sessão neste navegador e sai', async () => {
    const storage = memoryStorage();
    const client = await loggedClient(...MARIA, storage);
    const again = new SupabaseClient(config, { storage });
    const session = await again.restoreSession();
    assert.equal(session?.user.email, 'maria@example.com');
    await again.signOut();
    assert.equal(await new SupabaseClient(config, { storage }).restoreSession(), null);
    assert.ok(client);
  });

  it('renova a sessão automaticamente quando o token expira', async () => {
    const storage = memoryStorage();
    await loggedClient(...MARIA, storage);
    const later = new SupabaseClient(config, { storage, now: () => Math.floor(Date.now() / 1000) + 7200 });
    const before = JSON.parse(storage.getItem('mawe-os:sessao')!).accessToken;
    const session = await later.restoreSession();
    assert.ok(session);
    assert.notEqual(session.accessToken, before);
  });

  it('identifica o perfil de cada sócio e recusa contas que não são membros', async () => {
    assert.equal((await (await loggedClient(...MARIA)).fetchMember())?.appUserId, 'maria');
    assert.equal((await (await loggedClient(...WESLEY)).fetchMember())?.appUserId, 'wesley');
    assert.equal(await (await loggedClient('intruso@example.com', 'senha-do-intruso-123')).fetchMember(), null);
  });

  it('troca a senha', async () => {
    const client = await loggedClient('intruso@example.com', 'senha-do-intruso-123');
    await client.changePassword('nova-senha-segura-1');
    await loggedClient('intruso@example.com', 'nova-senha-segura-1');
  });
});

describe('dados compartilhados', () => {
  it('começa vazio (sem dados fictícios) e o outro sócio vê o que foi salvo', async () => {
    const maria = await Store.open({ source: new SupabaseDataSource(await loggedClient(...MARIA)), clock, initialDataset: 'empty', lockedUserId: 'maria' });
    assert.equal(maria.data.meta.dataset, 'empty');
    assert.equal(maria.data.tasks.length, 0);
    await maria.apply((d, ctx) => createTask(d, { title: 'Tarefa compartilhada', description: '', assigneeIds: ['wesley'], priority: 'alta', status: 'a_fazer', dueDate: null, related: null }, ctx));

    const wesley = await Store.open({ source: new SupabaseDataSource(await loggedClient(...WESLEY)), clock, initialDataset: 'empty', lockedUserId: 'wesley' });
    assert.equal(wesley.currentUser.id, 'wesley');
    const task = wesley.data.tasks.find((t) => t.title === 'Tarefa compartilhada');
    assert.equal(task?.createdBy, 'maria');
  });

  it('perfil fica travado na conta logada', async () => {
    const store = await Store.open({ source: new SupabaseDataSource(await loggedClient(...WESLEY)), clock, initialDataset: 'empty', lockedUserId: 'wesley' });
    store.setCurrentUser('maria');
    assert.equal(store.currentUser.id, 'wesley');
  });

  it('gravações simultâneas: a segunda é recusada e os dados são recarregados', async () => {
    const maria = await Store.open({ source: new SupabaseDataSource(await loggedClient(...MARIA)), clock, initialDataset: 'empty', lockedUserId: 'maria' });
    const wesley = await Store.open({ source: new SupabaseDataSource(await loggedClient(...WESLEY)), clock, initialDataset: 'empty', lockedUserId: 'wesley' });
    const input = (title: string) => ({ title, description: '', assigneeIds: ['maria'], priority: 'media' as const, status: 'a_fazer' as const, dueDate: null, related: null });
    await maria.apply((d, ctx) => createTask(d, input('Primeira gravação'), ctx));
    await assert.rejects(() => wesley.apply((d, ctx) => createTask(d, input('Gravação atrasada'), ctx)), ConflictError);
    // Wesley agora vê o que a Maria salvou e pode refazer a ação
    assert.ok(wesley.data.tasks.some((t) => t.title === 'Primeira gravação'));
    assert.ok(!wesley.data.tasks.some((t) => t.title === 'Gravação atrasada'));
    await wesley.apply((d, ctx) => createTask(d, input('Gravação atrasada'), ctx));
    assert.equal(await maria.sync(), true);
    assert.ok(maria.data.tasks.some((t) => t.title === 'Gravação atrasada'));
  });
});
