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
}

const PROFILE_KEY = 'mawe-os:perfil-ativo';

export class Store {
  readonly source: DataSource;
  private state: AppData;
  private userId: ID;
  private readonly listeners = new Set<Listener>();
  private readonly profileStorage?: StoreOptions['profileStorage'];
  private readonly clock: () => Date;

  private constructor(options: StoreOptions, data: AppData) {
    this.source = options.source;
    this.profileStorage = options.profileStorage;
    this.clock = options.clock ?? (() => new Date());
    this.state = data;
    const saved = this.profileStorage?.getItem(PROFILE_KEY);
    this.userId = data.users.some((u) => u.id === saved) ? (saved as ID) : data.users[0].id;
  }

  /** Carrega os dados salvos ou, na primeira vez, os dados de demonstração. */
  static async open(options: StoreOptions): Promise<Store> {
    const now = options.clock?.() ?? new Date();
    let data = await options.source.load();
    if (!data) {
      data = createDemoData(now);
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
    this.state = draft;
    this.notify();
    await this.source.save(draft);
    return result;
  }

  setCurrentUser(id: ID): void {
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
