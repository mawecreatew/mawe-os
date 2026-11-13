/**
 * Categorias editáveis pelos sócios: serviços, despesas, receitas, origem e
 * nicho dos leads e motivos de perda. Dá para criar, renomear, trocar a cor,
 * reordenar e arquivar (arquivada some das opções, mas o histórico continua).
 *
 * Serviços guardam o `id` da categoria. Nas demais listas os registros guardam
 * o próprio nome (como sempre foi), então renomear também atualiza os registros.
 */
import { createId } from '../core/id.ts';
import { normalizeText } from '../core/format.ts';
import type { AppData, Category, CategoryGroup, ProjectType, Tone } from './types.ts';

export interface CategoryGroupInfo {
  value: CategoryGroup;
  label: string;
  description: string;
  /** Onde a lista aparece no sistema. */
  usedIn: string;
}

export const CATEGORY_GROUPS: CategoryGroupInfo[] = [
  { value: 'servico', label: 'Categorias de serviço', description: 'Agrupam o catálogo de Serviços e preços e as propostas.', usedIn: 'Serviços e preços' },
  { value: 'despesa', label: 'Categorias de despesa', description: 'Para onde vai o dinheiro que sai.', usedIn: 'Financeiro' },
  { value: 'receita', label: 'Categorias de entrada', description: 'De onde vem o dinheiro que entra (além das parcelas de clientes).', usedIn: 'Financeiro' },
  { value: 'origem', label: 'Origem dos leads', description: 'Onde vocês encontraram a oportunidade.', usedIn: 'Comercial' },
  { value: 'segmento', label: 'Nichos (segmentos)', description: 'Tipos de negócio que vocês atendem. Aparecem como sugestão no cadastro.', usedIn: 'Comercial e Clientes' },
  { value: 'motivo_perda', label: 'Motivos de perda', description: 'Por que um lead não fechou. Viram o relatório "Por que não fecham".', usedIn: 'Comercial' },
];

const c = (id: string, label: string, tone: Tone = 'neutral'): Category => ({ id, label, tone });

/** Ids fixos: o resultado é igual nos dois navegadores (importante para a sincronização). */
export const DEFAULT_CATEGORIES: Record<CategoryGroup, Category[]> = {
  servico: [
    c('site', 'Site'),
    c('pacote', 'Pacotes', 'accent'),
    c('google', 'Google Meu Negócio', 'info'),
    c('design', 'Design e artes', 'progress'),
    c('instagram', 'Instagram', 'warning'),
    c('conteudo', 'Conteúdo', 'info'),
    c('sistema', 'Sistema', 'progress'),
    c('trafego', 'Tráfego pago', 'warning'),
    c('plano_mensal', 'Plano mensal', 'accent'),
    c('outro', 'Outro'),
  ],
  despesa: ['Ferramentas', 'Domínio', 'Hospedagem', 'Impostos', 'Marketing', 'Anúncios', 'Equipamentos', 'Outros'].map((l, i) => c(`desp_${i}`, l)),
  receita: ['Serviço avulso', 'Plano mensal', 'Indicação/comissão', 'Outros'].map((l, i) => c(`rec_${i}`, l)),
  origem: ['Google Maps', 'Instagram', 'Indicação', 'Site da Mawe', 'Ligação', 'Visita', 'LinkedIn', 'Evento', 'Outro'].map((l, i) => c(`ori_${i}`, l)),
  segmento: ['Hamburgueria', 'Pizzaria', 'Salgados e doces', 'Confeitaria', 'Marmitas', 'Barbearia', 'Estética', 'Estética automotiva', 'Pet shop', 'Academia', 'Advocacia', 'Saúde'].map((l, i) => c(`seg_${i}`, l)),
  motivo_perda: [
    c('perda_preco', 'Achou caro', 'warning'),
    c('perda_sem_resposta', 'Parou de responder', 'neutral'),
    c('perda_ja_tem', 'Já tem site ou alguém fazendo', 'info'),
    c('perda_sem_interesse', 'Sem interesse agora', 'neutral'),
    c('perda_outro_fornecedor', 'Fechou com outra pessoa', 'danger'),
    c('perda_sem_dinheiro', 'Sem dinheiro no momento', 'warning'),
    c('perda_outro', 'Outro motivo'),
  ],
};

/** Tipo de projeto criado a partir de cada categoria de serviço padrão. */
const PROJECT_TYPE_BY_CATEGORY: Record<string, ProjectType> = {
  site: 'site',
  sistema: 'sistema',
  conteudo: 'pacote_conteudo',
  design: 'pacote_conteudo',
  instagram: 'pacote_conteudo',
  plano_mensal: 'plano_mensal',
};

export function projectTypeForCategory(category: string): ProjectType {
  return PROJECT_TYPE_BY_CATEGORY[category] ?? 'outro';
}

/** Completa as listas que faltam e acrescenta as categorias padrão novas (sem tocar nas editadas). */
export function fillCategories(data: AppData): void {
  const current = (data.categories ?? {}) as Partial<Record<CategoryGroup, Category[]>>;
  const result = {} as Record<CategoryGroup, Category[]>;
  for (const group of CATEGORY_GROUPS.map((g) => g.value)) {
    const list = Array.isArray(current[group]) ? current[group]! : structuredClone(DEFAULT_CATEGORIES[group]);
    result[group] = list;
  }
  data.categories = result;
}

export function categories(data: Pick<AppData, 'categories'>, group: CategoryGroup, includeArchived = false): Category[] {
  const list = data.categories?.[group] ?? DEFAULT_CATEGORIES[group];
  return includeArchived ? list : list.filter((x) => !x.archived);
}

export function categoryLabel(data: Pick<AppData, 'categories'>, group: CategoryGroup, id: string): string {
  return (data.categories?.[group] ?? DEFAULT_CATEGORIES[group]).find((x) => x.id === id)?.label ?? id;
}

export function categoryTone(data: Pick<AppData, 'categories'>, group: CategoryGroup, id: string): Tone {
  return (data.categories?.[group] ?? DEFAULT_CATEGORIES[group]).find((x) => x.id === id)?.tone ?? 'neutral';
}

/** Nomes ativos de uma lista guardada por nome (despesa, receita, origem, segmento). */
export function categoryNames(data: Pick<AppData, 'categories'>, group: CategoryGroup, keep?: string | null): string[] {
  const names = categories(data, group).map((x) => x.label);
  return keep && !names.includes(keep) ? [...names, keep] : names;
}

/** Opções de serviço (por id), mantendo a categoria atual mesmo se arquivada. */
export function serviceCategoryOptions(data: Pick<AppData, 'categories'>, keep?: string): Array<{ value: string; label: string }> {
  const all = categories(data, 'servico', true);
  return all.filter((x) => !x.archived || x.id === keep).map((x) => ({ value: x.id, label: x.label }));
}

/** Grupos guardados por nome nos registros (renomear atualiza os registros). */
const BY_NAME: CategoryGroup[] = ['despesa', 'receita', 'origem', 'segmento', 'motivo_perda'];

function list(draft: AppData, group: CategoryGroup): Category[] {
  if (!draft.categories) fillCategories(draft);
  return draft.categories![group];
}

function mustFind(draft: AppData, group: CategoryGroup, id: string): Category {
  const item = list(draft, group).find((x) => x.id === id);
  if (!item) throw new Error('Categoria não encontrada. Atualize a página e tente de novo.');
  return item;
}

function checkName(draft: AppData, group: CategoryGroup, label: string, ignoreId?: string): string {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('Dê um nome para a categoria.');
  if (clean.length > 40) throw new Error('Use um nome de até 40 letras.');
  const key = normalizeText(clean);
  if (list(draft, group).some((x) => x.id !== ignoreId && normalizeText(x.label) === key)) throw new Error(`Já existe "${clean}" nesta lista.`);
  return clean;
}

export function addCategory(draft: AppData, group: CategoryGroup, label: string, tone: Tone = 'neutral'): Category {
  const item: Category = { id: createId('cat'), label: checkName(draft, group, label), tone };
  list(draft, group).push(item);
  return item;
}

export function renameCategory(draft: AppData, group: CategoryGroup, id: string, label: string): void {
  const item = mustFind(draft, group, id);
  const clean = checkName(draft, group, label, id);
  const old = item.label;
  item.label = clean;
  if (!BY_NAME.includes(group) || old === clean) return;
  // Registros que guardam o nome passam a usar o nome novo.
  if (group === 'despesa' || group === 'receita') {
    const kind = group === 'despesa' ? 'saida' : 'entrada';
    for (const e of draft.finance.entries) if (e.kind === kind && e.category === old) e.category = clean;
    if (group === 'despesa') for (const r of draft.finance.recurring) if (r.category === old) r.category = clean;
  }
  if (group === 'origem') for (const o of draft.opportunities) if (o.source === old) o.source = clean;
  if (group === 'segmento') {
    for (const o of draft.opportunities) if (o.segment === old) o.segment = clean;
    for (const cl of draft.clients) if (cl.segment === old) cl.segment = clean;
  }
  if (group === 'motivo_perda') for (const o of draft.opportunities) if (o.lostReason === old) o.lostReason = clean;
}

export function setCategoryTone(draft: AppData, group: CategoryGroup, id: string, tone: Tone): void {
  mustFind(draft, group, id).tone = tone;
}

export function toggleCategoryArchived(draft: AppData, group: CategoryGroup, id: string): void {
  const item = mustFind(draft, group, id);
  if (!item.archived && categories(draft, group).length <= 1) throw new Error('A lista precisa de pelo menos uma categoria ativa.');
  item.archived = !item.archived;
}

export function moveCategory(draft: AppData, group: CategoryGroup, id: string, direction: -1 | 1): void {
  const items = list(draft, group);
  const index = items.findIndex((x) => x.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target], items[index]];
}

/** Quantos registros usam a categoria (para mostrar na tela). */
export function categoryUsage(data: AppData, group: CategoryGroup, item: Category): number {
  switch (group) {
    case 'servico':
      return data.services.filter((s) => s.category === item.id).length;
    case 'despesa':
      return data.finance.entries.filter((e) => e.kind === 'saida' && e.category === item.label).length + data.finance.recurring.filter((r) => r.category === item.label).length;
    case 'receita':
      return data.finance.entries.filter((e) => e.kind === 'entrada' && e.category === item.label).length;
    case 'origem':
      return data.opportunities.filter((o) => o.source === item.label).length;
    case 'segmento':
      return data.opportunities.filter((o) => o.segment === item.label).length + data.clients.filter((cl) => cl.segment === item.label).length;
    case 'motivo_perda':
      return data.opportunities.filter((o) => o.lostReason === item.label).length;
  }
}
