/**
 * Store: guarda o estado atual em memória, aplica operações, salva na fonte de
 * dados e avisa a interface para redesenhar.
 */
import type { ActionContext } from '../domain/operations.ts';
import type { AppData, ID, User } from '../domain/types.ts';
import { createEmptyData, createDemoData } from './seed.ts';
import type { DataSource } from './source.ts';

type Listener = () => void;
export type Operation<R = void> = (draft: AppData, ctx: ActionContext) => R;

export interface StoreOptions {
  source: DataSource;
  /** Guarda qual perfil está ativo neste navegador. */
  profileStorage?: Pick<Storage, 'getItem' | 'setItem'>;
  clock?: () => Date;
  /** Conjunto criado quando a fonte ainda não tem dados. Padrão: demonstração. */
  initialDataset?: 'demo' | 'empty';
  /** Com login real, o perfil vem da conta e não pode ser trocado. */
  lockedUserId?: string;
}

const PROFILE_KEY = 'mawe-os:perfil-ativo';

export class Store {
  readonly source: DataSource;
  private state: AppData;
  private userId: ID;
  private readonly listeners = new Set<Listener>();
  private readonly profileStorage?: StoreOptions['profileStorage'];
  private readonly clock: () => Date;
  readonly profileLocked: boolean;

  private constructor(options: StoreOptions, data: AppData) {
    this.source = options.source;
    this.profileStorage = options.profileStorage;
    this.clock = options.clock ?? (() => new Date());
    this.state = data;
    this.profileLocked = Boolean(options.lockedUserId);
    if (options.lockedUserId) {
      if (!data.users.some((u) => u.id === options.lockedUserId)) {
        throw new Error(`Perfil "${options.lockedUserId}" não existe nos dados do Mawe OS.`);
      }
      this.userId = options.lockedUserId;
    } else {
      const saved = this.profileStorage?.getItem(PROFILE_KEY);
      this.userId = data.users.some((u) => u.id === saved) ? (saved as ID) : data.users[0].id;
    }
  }

  /** Carrega os dados salvos ou, na primeira vez, os dados de demonstração. */
  static async open(options: StoreOptions): Promise<Store> {
    const now = options.clock?.() ?? new Date();
    let data = await options.source.load();
    if (!data) {
      data = options.initialDataset === 'empty' ? createEmptyData(now) : createDemoData(now);
      await options.source.save(data);
    }
    return new Store(options, data);
  }

  get data(): AppData {
    return this.state;
  }

  get currentUser(): User {
    return this.state.users.find((u) => u.id === this.userId) ?? this.state.users[0];
  }

  now(): Date {
    return this.clock();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  /**
   * Aplica uma operação sobre uma cópia dos dados. Se der erro, nada muda.
   * Retorna o resultado da operação (ex.: o item criado).
   */
  async apply<R>(operation: Operation<R>): Promise<R> {
    const draft = structuredClone(this.state);
    const result = operation(draft, { userId: this.userId, now: this.clock() });
    const previous = this.state;
    this.state = draft;
    this.notify();
    try {
      await this.source.save(draft);
    } catch (error) {
      // Não salvou: volta ao que está gravado de fato (ou ao estado anterior).
      this.state = (await this.source.load().catch(() => null)) ?? previous;
      this.notify();
      throw error;
    }
    return result;
  }

  /** Busca a versão mais recente na fonte (ex.: alterações do outro sócio). Retorna true se mudou. */
  async sync(): Promise<boolean> {
    const latest = await this.source.load();
    if (!latest || JSON.stringify(latest) === JSON.stringify(this.state)) return false;
    this.state = latest;
    this.notify();
    return true;
  }

  setCurrentUser(id: ID): void {
    if (this.profileLocked) return;
    if (!this.state.users.some((u) => u.id === id)) return;
    this.userId = id;
    this.profileStorage?.setItem(PROFILE_KEY, id);
    this.notify();
  }

  async reset(dataset: 'demo' | 'empty'): Promise<void> {
    const now = this.clock();
    this.state = dataset === 'demo' ? createDemoData(now) : createEmptyData(now);
    await this.source.save(this.state);
    this.notify();
  }
}
