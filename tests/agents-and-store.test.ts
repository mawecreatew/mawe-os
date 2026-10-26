import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AGENT_GUARDRAILS, AGENTS } from '../src/agents/definitions.ts';
import { aiProvider } from '../src/agents/provider.ts';
import { routeRequest } from '../src/agents/routing.ts';
import { MemoryDataSource } from '../src/data/source.ts';
import { Store } from '../src/data/store.ts';
import { createTask } from '../src/domain/operations.ts';

describe('encaminhamento do coordenador (regras locais)', () => {
  it('envia pedidos comerciais ao agente comercial', () => {
    const r = routeRequest('Prepare uma abordagem e uma proposta para a Pousada');
    assert.equal(r.agentId, 'comercial');
    assert.ok(r.matched.includes('proposta'));
  });

  it('envia pedidos de prazos ao agente de organização', () => {
    assert.equal(routeRequest('Quais tarefas estão atrasadas e qual a prioridade de amanhã?').agentId, 'organizacao');
  });

  it('envia pedidos de código ao agente técnico, mesmo sem acentos', () => {
    assert.equal(routeRequest('revisar codigo do repositorio no github antes do deploy').agentId, 'tecnico');
  });

  it('não escolhe especialista quando não há sinal claro', () => {
    const r = routeRequest('Oi, tudo bem?');
    assert.equal(r.agentId, 'coordenador');
    assert.equal(r.ambiguous, true);
  });
});

describe('agentes', () => {
  it('nenhum modelo de IA está conectado nesta etapa', async () => {
    assert.equal(aiProvider.connected, false);
    await assert.rejects(() => aiProvider.generate({ agent: AGENTS[0], messages: [], context: '' }));
  });

  it('todas as instruções carregam os limites de revisão humana', () => {
    assert.equal(AGENTS.length, 4);
    for (const agent of AGENTS) for (const rule of AGENT_GUARDRAILS) assert.ok(agent.instructions.includes(rule));
  });
});

describe('store', () => {
  const clock = () => new Date(2026, 9, 26, 9);

  it('carrega a demonstração na primeira vez e salva alterações', async () => {
    const source = new MemoryDataSource();
    const store = await Store.open({ source, clock });
    assert.equal(store.data.meta.dataset, 'demo');
    let notified = 0;
    store.subscribe(() => notified++);
    await store.apply((draft, ctx) =>
      createTask(draft, { title: 'Nova', description: '', assigneeIds: ['wesley'], priority: 'baixa', status: 'a_fazer', dueDate: null, related: null }, ctx),
    );
    assert.equal(notified, 1);
    const saved = await source.load();
    assert.ok(saved!.tasks.some((t) => t.title === 'Nova' && t.createdBy === 'maria'));
  });

  it('não altera nada quando a operação falha', async () => {
    const store = await Store.open({ source: new MemoryDataSource(), clock });
    const before = JSON.stringify(store.data);
    await assert.rejects(() =>
      store.apply((draft) => {
        draft.tasks = [];
        throw new Error('falha');
      }),
    );
    assert.equal(JSON.stringify(store.data), before);
  });

  it('troca o perfil ativo e lembra a escolha', async () => {
    const memory = new Map<string, string>();
    const profileStorage = { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
    const source = new MemoryDataSource();
    const store = await Store.open({ source, clock, profileStorage });
    assert.equal(store.currentUser.id, 'maria');
    store.setCurrentUser('wesley');
    const reopened = await Store.open({ source, clock, profileStorage });
    assert.equal(reopened.currentUser.id, 'wesley');
    store.setCurrentUser('desconhecido');
    assert.equal(store.currentUser.id, 'wesley');
  });

  it('reinicia com base vazia', async () => {
    const store = await Store.open({ source: new MemoryDataSource(), clock });
    await store.reset('empty');
    assert.equal(store.data.tasks.length, 0);
    assert.equal(store.data.users.length, 2);
  });
});
