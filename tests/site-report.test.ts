/** Relatório do site do cliente (Clarity) e o código de instalação. */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { todayISO } from '../src/core/dates.ts';
import { createEmptyData } from '../src/data/seed.ts';
import { documentText } from '../src/domain/documents.ts';
import { todayFocus } from '../src/domain/insights.ts';
import { createClient, type ActionContext } from '../src/domain/operations.ts';
import { change, firstName, parseClarityId, saveSiteSettings, saveSiteStat, siteInstallSnippet, siteReportDocument, siteStatsMissing, suggestedMonth } from '../src/domain/sitereport.ts';
import type { SiteStat } from '../src/domain/types.ts';

const NOW = new Date(2026, 11, 3, 10, 0); // 03/12/2026
const ctx: ActionContext = { userId: 'maria', now: NOW };
const stat = (month: string, visits: number, whatsapp: number | null): SiteStat => ({ month, visits, people: null, whatsapp, instagram: null, phone: 2, topSource: 'Google', notes: '' });

function setup() {
  const data = createEmptyData(NOW);
  const client = createClient(data, { company: 'Leci Salgados', contactName: 'Leci Souza', segment: 'Alimentação', contact: { phone: '' }, city: 'Brusque', contractStatus: 'em_andamento', nextStep: '', notes: '' }, ctx);
  return { data, client };
}

describe('relatório do site', () => {
  it('aceita o ID ou o endereço do painel do Clarity', () => {
    assert.equal(parseClarityId(' K8X2ABC '), 'k8x2abc');
    assert.equal(parseClarityId('https://clarity.microsoft.com/projects/view/k8x2abc/dashboard'), 'k8x2abc');
    assert.throws(() => parseClarityId('meu site'), /letras e números/);
    assert.equal(firstName('Dra. Helena Prado'), 'Helena');
  });

  it('guarda os números do mês, monta o PDF e compara com o mês anterior', () => {
    const { data, client } = setup();
    saveSiteSettings(data, client.id, { url: 'https://lecisalgados.com.br', clarityId: 'k8x2abc' });
    saveSiteStat(data, client.id, stat('2026-10', 200, 10));
    saveSiteStat(data, client.id, stat('2026-11', 250, 15));
    saveSiteStat(data, client.id, stat('2026-11', 260, 15));
    assert.equal(client.site?.stats.length, 2, 'anotar de novo o mesmo mês substitui');
    assert.equal(change(260, 200), 30);
    const text = documentText(siteReportDocument(data, client, '2026-11'));
    assert.match(text, /RELATÓRIO DO SITE/);
    assert.match(text, /260/);
    assert.match(text, /\+30% em relação ao mês anterior/);
    assert.match(text, /17 pessoas clicaram/);
    assert.throws(() => siteReportDocument(data, client, '2026-09'), /Anote os números/);
  });

  it('lembra de anotar no começo do mês, no Pra fazer hoje', () => {
    const { data, client } = setup();
    saveSiteSettings(data, client.id, { url: '', clarityId: 'k8x2abc' });
    const t = todayISO(NOW);
    assert.equal(suggestedMonth(t), '2026-11');
    assert.equal(siteStatsMissing(data, t).length, 1);
    assert.ok(todayFocus(data, t, { finance: false }).some((i) => i.kind === 'site'));
    saveSiteStat(data, client.id, stat('2026-11', 100, null));
    assert.equal(siteStatsMissing(data, t).length, 0);
    assert.equal(siteStatsMissing(data, '2026-12-20').length, 0, 'depois do dia 10 não lembra');
  });

  it('o código do site é JavaScript válido e só liga o Clarity depois do aceite', () => {
    const code = siteInstallSnippet('k8x2abc');
    assert.match(code, /clarity\.ms\/tag\//);
    assert.match(code, /'k8x2abc'/);
    const script = /<script>([\s\S]*)<\/script>/.exec(code)![1];
    assert.doesNotThrow(() => new Function(script));
    assert.ok(script.indexOf("choice === 'aceitar'") > -1);
    assert.ok(!code.includes('—'), 'sem travessão no texto do site');
    assert.throws(() => siteInstallSnippet(''), /ID/);
  });
});
