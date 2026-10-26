/**
 * Fonte de dados (onde as informações ficam guardadas).
 *
 * Hoje: `LocalStorageDataSource` — os dados ficam somente neste navegador,
 * neste computador. Não são compartilhados entre Maria Eduarda e Wesley.
 *
 * Futuro: criar uma `ApiDataSource` (ou similar) que implemente a mesma
 * interface conversando com um banco de dados real com autenticação. Como a
 * interface já é assíncrona (Promise), o resto do sistema não precisa mudar.
 */
import type { AppData } from '../domain/types.ts';

export const SCHEMA_VERSION = 1;

export interface DataSource {
  /** Nome exibido na tela "Sistema" para deixar claro onde os dados estão. */
  readonly label: string;
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
  clear(): Promise<void>;
}

function isCompatible(value: unknown): value is AppData {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as AppData).schemaVersion === SCHEMA_VERSION &&
    Array.isArray((value as AppData).tasks)
  );
}

export class LocalStorageDataSource implements DataSource {
  readonly label = 'Armazenamento local do navegador (localStorage)';
  private readonly key: string;
  private readonly storage: Storage;

  constructor(key: string, storage: Storage = window.localStorage) {
    this.key = key;
    this.storage = storage;
  }

  async load(): Promise<AppData | null> {
    try {
      const rawValue = this.storage.getItem(this.key);
      if (!rawValue) return null;
      const parsed: unknown = JSON.parse(rawValue);
      return isCompatible(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  async save(data: AppData): Promise<void> {
    this.storage.setItem(this.key, JSON.stringify(data));
  }

  async clear(): Promise<void> {
    this.storage.removeItem(this.key);
  }
}

/** Fonte em memória — usada nos testes e quando o navegador bloqueia o armazenamento. */
export class MemoryDataSource implements DataSource {
  readonly label = 'Memória temporária (os dados somem ao recarregar)';
  private data: AppData | null;

  constructor(initial: AppData | null = null) {
    this.data = initial ? structuredClone(initial) : null;
  }

  async load(): Promise<AppData | null> {
    return this.data ? structuredClone(this.data) : null;
  }

  async save(data: AppData): Promise<void> {
    this.data = structuredClone(data);
  }

  async clear(): Promise<void> {
    this.data = null;
  }
}
