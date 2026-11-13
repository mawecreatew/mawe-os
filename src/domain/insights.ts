/**
 * Visões de gestão para o Painel: o que precisa ser feito hoje e onde o
 * funil de vendas está perdendo clientes. Funções puras (testáveis).
 */
import { addDays, type ISODate } from '../core/dates.ts';
import { followStatus } from './commercial.ts';
import { upcomingBills } from './finance.ts';
import { WON_STAGE, isOpenStage, openStages } from './labels.ts';
import { activeProjects } from './selectors.ts';
import type { AppData, ID, Opportunity } from './types.ts';

// ---------------------------------------------------------------- Foco de hoje

export type FocusKind = 'followup' | 'task' | 'bill' | 'delivery' | 'domain';

export interface FocusItem {
  key: string;
  kind: FocusKind;
  title: string;
  subtitle: string;
  date: ISODate;
  /** Venceu antes de hoje. */
  overdue: boolean;
  href: string;
  /** Pessoas responsáveis (para mostrar avatares). */
  ownerIds: ID[];
  /** Tarefa: id para marcar como concluída. */
  taskId?: ID;
  /** Conta: chave do movimento para marcar como paga/recebida. */
  movementKey?: string;
  /** Conta: entrada (a receber) ou saída (a pagar). */
  billKind?: 'entrada' | 'saida';
  amount?: number;
}

/**
 * Tudo que pede ação até hoje (e entregas/contas dos próximos dias), numa
 * lista só e em ordem de urgência: o primeiro lugar para onde olhar ao abrir
 * o sistema.
 */
export function todayFocus(data: AppData, today: ISODate, options: { finance: boolean; daysAhead?: number } = { finance: true }): FocusItem[] {
  const ahead = options.daysAhead ?? 2;
  const items: FocusItem[] = [];

  for (const o of data.opportunities) {
    if (!isOpenStage(o.stage)) continue;
    const status = followStatus(data, o, today);
    if (!status.needsAction) continue;
    const title =
      status.state === 'follow_up' ? `Fazer follow-up com ${o.company}` : status.state === 'lembrete' ? `Lembrete: ${o.company}` : `Retornar para ${o.company}`;
    items.push({
      key: `o:${o.id}`,
      kind: 'followup',
      title,
      subtitle: status.state === 'follow_up' ? `${status.label}${o.nextAction ? ` · ${o.nextAction}` : ''}` : o.nextAction || 'Retorno comercial',
      date: o.followUpDate && o.followUpDate <= today ? o.followUpDate : today,
      // Só fica "atrasado" o que depende de vocês e já passou da data.
      overdue: status.state === 'pendente',
      href: `#/comercial/${o.id}`,
      ownerIds: o.ownerIds,
    });
  }

  // Domínios de clientes que renovam nos próximos 30 dias.
  for (const c of data.clients) {
    const renews = c.domain?.renewsOn;
    if (!renews || renews > addDays(today, 30)) continue;
    items.push({
      key: `d:${c.id}`,
      kind: 'domain',
      title: `Renovar domínio ${c.domain!.name || ''} (${c.company})`.replace('  ', ' '),
      subtitle: renews < today ? 'Domínio venceu: confira com o cliente' : 'Avisar o cliente para renovar no registro.br',
      date: renews,
      overdue: renews < today,
      href: `#/clientes/${c.id}`,
      ownerIds: [],
    });
  }

  for (const t of data.tasks) {
    if (t.status === 'concluida' || !t.dueDate || t.dueDate > today) continue;
    items.push({
      key: `t:${t.id}`,
      kind: 'task',
      title: t.title,
      subtitle: 'Tarefa',
      date: t.dueDate,
      overdue: t.dueDate < today,
      href: '#/tarefas',
      ownerIds: t.assigneeIds,
      taskId: t.id,
    });
  }

  if (options.finance) {
    for (const m of upcomingBills(data, today, ahead)) {
      items.push({
        key: `b:${m.key}`,
        kind: 'bill',
        title: m.description,
        subtitle: m.kind === 'entrada' ? 'A receber' : 'A pagar',
        date: m.dueDate,
        overdue: m.dueDate < today,
        href: '#/financeiro',
        ownerIds: [],
        movementKey: m.key,
        billKind: m.kind,
        amount: m.amount,
      });
    }
  }

  const limit = addDays(today, ahead);
  for (const p of activeProjects(data)) {
    if (p.dueDate > limit) continue;
    items.push({
      key: `p:${p.id}`,
      kind: 'delivery',
      title: `Entregar ${p.name}`,
      subtitle: 'Entrega de projeto',
      date: p.dueDate,
      overdue: p.dueDate < today,
      href: `#/projetos/${p.id}`,
      ownerIds: p.ownerIds,
    });
  }

  const weight: Record<FocusKind, number> = { followup: 0, bill: 1, delivery: 2, task: 3, domain: 4 };
  return items.sort((a, b) => a.date.localeCompare(b.date) || weight[a.kind] - weight[b.kind] || a.title.localeCompare(b.title));
}

// ---------------------------------------------------------------- Funil de vendas

export interface FunnelStep {
  id: 'leads' | 'contatados' | 'responderam' | 'proposta' | 'fechados';
  label: string;
  count: number;
  /** Percentual em relação à etapa anterior (null na primeira). */
  rate: number | null;
}

export interface SalesFunnel {
  steps: FunnelStep[];
  /** Etapa em que mais gente se perde (só quando há dados suficientes). */
  bottleneck: { from: FunnelStep; to: FunnelStep; lost: number; advice: string } | null;
}

const ADVICE: Record<FunnelStep['id'], string> = {
  leads: '',
  contatados: 'Tem muito lead parado sem contato. Reserve um horário fixo por dia só para prospecção e exclua os que não valem a pena.',
  responderam: 'Muita gente não responde ao primeiro contato. Teste uma abertura mais curta e pessoal, e faça um segundo contato depois de 2 dias.',
  proposta: 'Quem responde não está chegando ao valor. Mostre a prévia do site logo na conversa e já combine quando vai mandar a proposta.',
  fechados: 'O cliente some depois do preço. Envie o valor junto com o que está incluso, ofereça entrada + restante na entrega e faça um retorno em até 48h.',
};

/** Funil de conversão a partir das marcações de cada oportunidade (contato, resposta, proposta, ganho). */
export function salesFunnel(data: AppData): SalesFunnel {
  const stages = openStages(data);
  const position = (id: string) => stages.indexOf(id);
  const reached = (o: Opportunity, stageId: string) => {
    if (o.stage === WON_STAGE || o.clientId) return true;
    const target = position(stageId);
    const current = position(o.stage);
    return target >= 0 && current >= target;
  };
  const priced = new Set(data.proposals.filter((p) => p.opportunityId && (p.sentAt || p.status !== 'rascunho')).map((p) => p.opportunityId!));

  let contacted = 0;
  let replied = 0;
  let proposal = 0;
  let won = 0;
  for (const o of data.opportunities) {
    const isWon = o.stage === WON_STAGE || Boolean(o.clientId);
    const hasPrice = isWon || priced.has(o.id) || reached(o, 'negociacao');
    const hasReply = hasPrice || Boolean(o.repliedAt);
    const wasContacted = hasReply || Boolean(o.contactedAt) || reached(o, 'contato_realizado');
    if (wasContacted) contacted++;
    if (hasReply) replied++;
    if (hasPrice) proposal++;
    if (isWon) won++;
  }

  const raw: Array<Omit<FunnelStep, 'rate'>> = [
    { id: 'leads', label: 'Leads no funil', count: data.opportunities.length },
    { id: 'contatados', label: 'Contatados', count: contacted },
    { id: 'responderam', label: 'Responderam', count: replied },
    { id: 'proposta', label: 'Receberam valor', count: proposal },
    { id: 'fechados', label: 'Fecharam', count: won },
  ];
  const steps: FunnelStep[] = raw.map((s, i) => ({
    ...s,
    rate: i === 0 ? null : raw[i - 1].count ? (s.count / raw[i - 1].count) * 100 : 0,
  }));

  let bottleneck: SalesFunnel['bottleneck'] = null;
  for (let i = 1; i < steps.length; i++) {
    const from = steps[i - 1];
    const to = steps[i];
    // Precisa de pelo menos 3 pessoas na etapa anterior para a conclusão fazer sentido.
    if (from.count < 3) continue;
    const lostShare = 1 - to.count / from.count;
    if (!bottleneck || lostShare > 1 - bottleneck.to.count / bottleneck.from.count) {
      bottleneck = { from, to, lost: from.count - to.count, advice: ADVICE[to.id] };
    }
  }
  if (bottleneck && bottleneck.lost === 0) bottleneck = null;
  return { steps, bottleneck };
}

