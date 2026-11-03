import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { addDays, todayISO } from '../src/core/dates.ts';
import { createDemoData, createEmptyData } from '../src/data/seed.ts';
import { percentChange, periodRange, revenueReport, saveFinanceEntry } from '../src/domain/finance.ts';
import { salesFunnel, todayFocus } from '../src/domain/insights.ts';
import { createOpportunity, deleteOpportunities, type ActionContext } from '../src/domain/operations.ts';
import type { AppData } from '../src/domain/types.ts';

const NOW = new Date(2026, 10, 3, 9, 0); // 03/11/2026, 9h
const TODAY = todayISO(NOW);
const ctx: ActionContext = { userId: 'maria', now: NOW };

let data: AppData;
beforeEach(() => {
  data = createEmptyData(NOW);
});

function entry(kind: 'entrada' | 'saida', amount: number, paidAt: string | null, dueDate = paidAt ?? TODAY) {
  saveFinanceEntry(data, null, { kind, description: `${kind} ${amount}`, amount, dueDate, paidAt, category: kind === 'entrada' ? 'Serviços' : 'Ferramentas', paidBy: 'agencia', clientId: null, notes: '' }, ctx);
}

describe('gráfico de faturamento do Painel', () => {
  it('soma por dia o que foi recebido e pago, pela data do pagamento', () => {
    entry('entrada', 500, TODAY);
    entry('entrada', 300, addDays(TODAY, -2));
    entry('saida', 49.9, addDays(TODAY, -2));
    entry('entrada', 1000, null, addDays(TODAY, 5)); // ainda não recebido
    const report = revenueReport(data, '7d', TODAY);
    assert.equal(report.points.length, 7);
    assert.equal(report.points.at(-1)!.key, TODAY);
    assert.equal(report.points.at(-1)!.revenue, 500);
    assert.equal(report.points.at(-3)!.revenue, 300);
    assert.equal(report.points.at(-3)!.expenses, 49.9);
    assert.equal(report.revenue, 800);
    assert.equal(report.payments, 2);
    assert.ok(Math.abs(report.profit - 750.1) < 1e-9);
  });

  it('compara com o período anterior do mesmo tamanho', () => {
    entry('entrada', 200, addDays(TODAY, -1));
    entry('entrada', 100, addDays(TODAY, -8));
    const report = revenueReport(data, '7d', TODAY);
    assert.equal(report.previousRevenue, 100);
    assert.equal(percentChange(report.revenue, report.previousRevenue), 100);
    assert.equal(percentChange(50, 0), null);
  });

  it('"Este mês" vai até hoje e "12 meses" agrupa por mês', () => {
    assert.deepEqual(periodRange('mes', TODAY), { from: '2026-11-01', to: TODAY });
    entry('entrada', 900, '2026-06-15');
    const year = revenueReport(data, '12m', TODAY);
    assert.equal(year.granularity, 'mes');
    assert.equal(year.points.length, 12);
    assert.equal(year.points[0].key, '2025-12');
    assert.equal(year.points.find((p) => p.key === '2026-06')!.revenue, 900);
  });
});

describe('foco de hoje', () => {
  it('junta retornos, tarefas, contas e entregas em ordem de urgência', () => {
    const demo = createDemoData(NOW);
    const items = todayFocus(demo, TODAY, { finance: true });
    assert.ok(items.length > 0);
    for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].date <= items[i].date);
    assert.ok(items.every((i) => i.date <= addDays(TODAY, 2)));
    assert.ok(items.some((i) => i.kind === 'followup'));
    // Sem permissão financeira, as contas não aparecem.
    assert.ok(todayFocus(demo, TODAY, { finance: false }).every((i) => i.kind !== 'bill'));
  });
});

describe('funil de vendas', () => {
  it('conta cada etapa e aponta onde mais gente se perde', () => {
    for (let i = 0; i < 6; i++) {
      const opp = createOpportunity(data, { contactName: '', company: `Lead ${i}`, segment: '', source: 'Instagram', contact: {}, stage: 'identificada', estimatedValue: null, nextAction: '', followUpDate: null, ownerIds: ['maria'], notes: '' }, ctx);
      if (i < 5) opp.contactedAt = TODAY;
      if (i < 4) opp.repliedAt = TODAY;
      if (i < 4) opp.stage = 'negociacao';
      if (i === 0) opp.stage = 'ganho';
    }
    const funnel = salesFunnel(data);
    assert.deepEqual(funnel.steps.map((s) => s.count), [6, 5, 4, 4, 1]);
    assert.equal(funnel.bottleneck?.to.id, 'fechados');
    assert.equal(funnel.bottleneck?.lost, 3);
  });
});

describe('excluir várias oportunidades', () => {
  it('remove as escolhidas e solta as tarefas ligadas a elas', () => {
    const demo = createDemoData(NOW);
    const [a, b] = demo.opportunities;
    const linked = demo.tasks.find((t) => t.related?.type === 'opportunity' && (t.related.id === a.id || t.related.id === b.id));
    const removed = deleteOpportunities(demo, [a.id, b.id, 'nao_existe']);
    assert.equal(removed, 2);
    assert.ok(!demo.opportunities.some((o) => o.id === a.id || o.id === b.id));
    if (linked) assert.equal(demo.tasks.find((t) => t.id === linked.id)!.related, null);
  });
});
