import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays, diffInDays, relativeDay, toISODate } from '../src/core/dates.ts';
import { formatCurrency, initials, normalizeText, parseMoney } from '../src/core/format.ts';
import { cx, html, raw } from '../src/core/html.ts';
import { parseHash } from '../src/core/router.ts';

describe('html seguro', () => {
  it('escapa texto digitado pelo usuário', () => {
    const userInput = '<img src=x onerror="alert(1)">';
    assert.equal(html`<p>${userInput}</p>`.value, '<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>');
  });

  it('não escapa trechos confiáveis e ignora valores vazios', () => {
    assert.equal(html`<div>${raw('<b>ok</b>')}${null}${false}${undefined}</div>`.value, '<div><b>ok</b></div>');
  });

  it('junta listas de templates', () => {
    const items = ['a', 'b'].map((x) => html`<li>${x}</li>`);
    assert.equal(html`<ul>${items}</ul>`.value, '<ul><li>a</li><li>b</li></ul>');
  });

  it('cx ignora classes vazias', () => {
    assert.equal(cx('a', false, 'b', null, 0, undefined), 'a b');
  });
});

describe('datas', () => {
  it('soma dias atravessando o mês', () => {
    assert.equal(addDays('2026-10-30', 3), '2026-11-02');
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
  });

  it('calcula diferença em dias', () => {
    assert.equal(diffInDays('2026-10-26', '2026-10-30'), 4);
    assert.equal(diffInDays('2026-10-26', '2026-10-20'), -6);
  });

  it('descreve datas relativas', () => {
    assert.equal(relativeDay('2026-10-26', '2026-10-26'), 'hoje');
    assert.equal(relativeDay('2026-10-27', '2026-10-26'), 'amanhã');
    assert.equal(relativeDay('2026-10-29', '2026-10-26'), 'em 3 dias');
    assert.equal(relativeDay('2026-10-24', '2026-10-26'), 'há 2 dias');
  });

  it('gera data local no formato AAAA-MM-DD', () => {
    assert.equal(toISODate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  });
});

describe('formatação', () => {
  it('interpreta valores em reais', () => {
    assert.equal(parseMoney('1.500,50'), 1500.5);
    assert.equal(parseMoney('R$ 2.000'), 2000);
    assert.equal(parseMoney('1500.5'), 1500.5);
    assert.equal(parseMoney(''), null);
    assert.equal(parseMoney('abc'), null);
    assert.equal(parseMoney('12.345.678'), 12345678);
    assert.equal(parseMoney('99.9'), 99.9);
  });

  it('formata moeda brasileira', () => {
    assert.match(formatCurrency(4200), /R\$\s?4\.200/);
  });

  it('gera iniciais e normaliza texto', () => {
    assert.equal(initials('Maria Eduarda'), 'ME');
    assert.equal(initials('Wesley'), 'W');
    assert.equal(normalizeText('Orçamento PRÉVIO'), 'orcamento previo');
  });
});

describe('roteador', () => {
  it('interpreta seções e parâmetros', () => {
    assert.deepEqual(parseHash('#/comercial/opp_1'), { section: 'comercial', params: ['opp_1'] });
    assert.deepEqual(parseHash(''), { section: 'painel', params: [] });
  });
});
