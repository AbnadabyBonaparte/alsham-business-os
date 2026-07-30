import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateMovement, validateNewHolding } from './investments.ts';

describe('a validação do investimento novo', () => {
  test('investimento bom passa; tipo/instituição livres', () => {
    const r = validateNewHolding({ name: 'CDB Banco X', kind: 'CDB', institution: 'Banco X', currency: 'BRL' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.name, 'CDB Banco X');
      assert.equal(r.value.kind, 'CDB');
    }
  });

  test('nome vazio é recusado', () => {
    const r = validateNewHolding({ name: '  ', currency: 'BRL' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });

  test('⭐ moeda fora do ISO é recusada', () => {
    for (const currency of ['reais', 'br', '']) {
      const r = validateNewHolding({ name: 'X', currency });
      assert.equal(r.ok, false, `currency=${currency} deveria falhar`);
    }
  });
});

describe('a validação do ato', () => {
  test('aplicação positiva passa', () => {
    assert.equal(validateMovement({ kind: 'application', amountCents: 100000, currency: 'BRL', occurredOn: '2026-07-15' }).ok, true);
    assert.equal(validateMovement({ kind: 'yield', amountCents: 500, currency: 'BRL', occurredOn: '2026-07-15' }).ok, true);
    assert.equal(validateMovement({ kind: 'redemption', amountCents: 3000, currency: 'BRL', occurredOn: '2026-07-15' }).ok, true);
  });

  test('tipo desconhecido é recusado', () => {
    const r = validateMovement({ kind: 'sale', amountCents: 100, currency: 'BRL', occurredOn: '2026-07-15' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'kind'));
  });

  test('valor não-positivo é recusado', () => {
    for (const amountCents of [0, -100, 1.5]) {
      const r = validateMovement({ kind: 'application', amountCents, currency: 'BRL', occurredOn: '2026-07-15' });
      assert.equal(r.ok, false, `valor=${amountCents} deveria falhar`);
    }
  });

  test('data não-ISO é recusada', () => {
    const r = validateMovement({ kind: 'application', amountCents: 1000, currency: 'BRL', occurredOn: '15/07/2026' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'occurredOn'));
  });
});
