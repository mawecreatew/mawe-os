/**
 * Fonte de dados no Supabase: os dados da agência ficam num único registro
 * (tabela `workspace`, linha `main`), compartilhado por quem tem acesso.
 *
 * Para evitar que um sócio apague sem querer a alteração do outro, cada
 * gravação informa a versão que leu. Se alguém salvou antes, a gravação é
 * recusada (ConflictError) e o sistema recarrega os dados mais recentes.
 */
import type { DataSource } from '../../data/source.ts';
import { SCHEMA_VERSION } from '../../data/source.ts';
import type { AppData } from '../../domain/types.ts';
import type { SupabaseClient } from './client.ts';

export class ConflictError extends Error {
  constructor() {
    super('Outra pessoa salvou uma alteração ao mesmo tempo. Os dados foram atualizados; refaça sua última ação.');
    this.name = 'ConflictError';
  }
}

const ROW = 'workspace?id=eq.main';

export class SupabaseDataSource implements DataSource {
  readonly label = 'Supabase (banco de dados compartilhado, com login)';
  private readonly client: SupabaseClient;
  private version: number | null = null;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async load(): Promise<AppData | null> {
    const response = await this.client.rest(`${ROW}&select=data,version`);
    if (!response.ok) throw new Error(`Não foi possível carregar os dados (erro ${response.status}).`);
    const rows = (await response.json()) as Array<{ data: AppData | null; version: number }>;
    if (!rows.length) {
      throw new Error('A tabela "workspace" está vazia. Rode o arquivo supabase/schema.sql no Supabase (veja docs/SUPABASE.md).');
    }
    this.version = rows[0].version;
    const data = rows[0].data;
    if (data && data.schemaVersion !== SCHEMA_VERSION) {
      throw new Error('Os dados no Supabase estão em um formato diferente desta versão do Mawe OS.');
    }
    return data;
  }

  async save(data: AppData): Promise<void> {
    if (this.version === null) await this.load();
    const current = this.version!;
    const response = await this.client.rest(`${ROW}&version=eq.${current}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ data, version: current + 1 }),
    });
    if (!response.ok) throw new Error(`Não foi possível salvar (erro ${response.status}).`);
    const rows = (await response.json()) as unknown[];
    if (!rows.length) throw new ConflictError();
    this.version = current + 1;
  }

  async clear(): Promise<void> {
    throw new Error('Para apagar os dados compartilhados, use o painel do Supabase.');
  }
}
