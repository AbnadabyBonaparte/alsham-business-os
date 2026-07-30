import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewBudget } from './budgets.ts';

describe('a validação do orçamento novo', () => {
  const bom = {
    name: 'Marketing Q3',
    category: 'Marketing',
    startsOn: '2026-07-01',
    endsOn: '2026-09-30',
    limitCents: 500000,
    currency: 'BRL',
  };

  test('o orçamento coerente passa', () => {
    const r = validateNewBudget(bom);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.category, 'Marketing');
      assert.equal(r.value.limitCents, 500000);
    }
  });

  test('nome vazio é recusado', () => {
    const r = validateNewBudget({ ...bom, name: '   ' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });

  test('⭐ categoria vazia é recusada — é O dado que casa com o cash', () => {
    const r = validateNewBudget({ ...bom, category: '' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'category'));
  });

  test('período invertido é recusado — o fim não vem antes do início', () => {
    const r = validateNewBudget({ ...bom, startsOn: '2026-09-30', endsOn: '2026-07-01' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'endsOn'));
  });

  test('mesmo dia de início e fim é válido — orçamento de um dia existe', () => {
    const r = validateNewBudget({ ...bom, startsOn: '2026-07-01', endsOn: '2026-07-01' });
    assert.equal(r.ok, true);
  });

  test('data não-ISO é recusada', () => {
    const r = validateNewBudget({ ...bom, startsOn: '01/07/2026' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'startsOn'));
  });

  test('teto não-positivo é recusado', () => {
    for (const limitCents of [0, -100, 1.5, 'muito']) {
      const r = validateNewBudget({ ...bom, limitCents });
      assert.equal(r.ok, false, `limitCents=${String(limitCents)} deveria falhar`);
    }
  });

  test('⭐ moeda fora do padrão ISO é recusada — valor e moeda andam juntos', () => {
    for (const currency of ['reais', 'br', 'BRLL', '']) {
      const r = validateNewBudget({ ...bom, currency });
      assert.equal(r.ok, false, `currency=${currency} deveria falhar`);
    }
  });

  test('acumula os problemas — não para no primeiro', () => {
    const r = validateNewBudget({ name: '', category: '', startsOn: 'x', endsOn: 'y', limitCents: 0, currency: '' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.length >= 4);
  });
});
