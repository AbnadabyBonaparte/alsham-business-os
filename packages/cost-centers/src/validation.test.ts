import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateCenterName, validateExecution } from './cost-centers.ts';

describe('validateCenterName', () => {
  test('nome livre passa', () => {
    const r = validateCenterName('Obra Zona Sul');
    assert.equal(r.ok, true);
  });
  test('⛔ nome vazio não passa', () => {
    const r = validateCenterName('   ');
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.problems[0]!.field, 'name');
  });
});

describe('validateExecution', () => {
  test('o mínimo: total positivo, moeda ISO, origem com tipo, competência', () => {
    const r = validateExecution({
      totalCents: 100000,
      currency: 'BRL',
      sourceKind: 'cash-entry',
      competenceOn: '2026-08-01',
    });
    assert.equal(r.ok, true);
  });

  test('⛔ total zero ou negativo não rateia', () => {
    const r = validateExecution({ totalCents: 0, currency: 'BRL', sourceKind: 'x', competenceOn: '2026-08-01' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'totalCents'));
  });

  test('⛔ sem tipo de origem não se sabe de onde vem o custo', () => {
    const r = validateExecution({ totalCents: 100, currency: 'BRL', sourceKind: '  ', competenceOn: '2026-08-01' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'sourceKind'));
  });

  test('⛔ moeda fora do ISO não passa', () => {
    const r = validateExecution({ totalCents: 100, currency: 'reais', sourceKind: 'x', competenceOn: '2026-08-01' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'currency'));
  });
});
