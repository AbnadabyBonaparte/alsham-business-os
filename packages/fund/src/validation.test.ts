import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { canSpend, computeBalance, summarize, validateNewContribution, validateNewExpense } from './fund.ts';

describe('validateNewContribution', () => {
  test('o mínimo honesto: lojista, competência e valor', () => {
    const r = validateNewContribution({
      storeId: 'store-1',
      competenceOn: '2026-07-01',
      amountCents: 50000,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.storeId, 'store-1');
      assert.equal(r.value.amountCents, 50000);
    }
  });

  test('⛔ sem lojista, sem competência ou sem valor positivo não cadastra', () => {
    assert.equal(validateNewContribution({ competenceOn: '2026-07-01', amountCents: 100 }).ok, false);
    assert.equal(validateNewContribution({ storeId: 'store-1', amountCents: 100 }).ok, false);
    assert.equal(
      validateNewContribution({ storeId: 'store-1', competenceOn: '2026-07-01', amountCents: 0 }).ok,
      false,
    );
    assert.equal(
      validateNewContribution({ storeId: 'store-1', competenceOn: '2026-07-01', amountCents: -10 }).ok,
      false,
    );
  });

  test('⛔ moeda que não é código ISO de três letras não cadastra', () => {
    const r = validateNewContribution({
      storeId: 'store-1',
      competenceOn: '2026-07-01',
      amountCents: 100,
      currency: 'reais',
    });
    assert.equal(r.ok, false);
  });

  test('o nome do lojista carimba; sem ele fica vazio (a tela preenche depois)', () => {
    const r = validateNewContribution({
      storeId: 'store-1',
      storeName: 'Ateliê da Praça',
      competenceOn: '2026-07-01',
      amountCents: 100,
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.storeName, 'Ateliê da Praça');
  });
});

describe('validateNewExpense', () => {
  test('o mínimo honesto: valor e razão', () => {
    const r = validateNewExpense({ amountCents: 3000, reason: 'panfletagem de dezembro' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.amountCents, 3000);
      assert.equal(r.value.reason, 'panfletagem de dezembro');
      assert.equal(r.value.campaignId, null);
    }
  });

  test('⛔ sem valor positivo ou sem razão não lança', () => {
    assert.equal(validateNewExpense({ reason: 'x' }).ok, false);
    assert.equal(validateNewExpense({ amountCents: 100 }).ok, false);
    assert.equal(validateNewExpense({ amountCents: 0, reason: 'x' }).ok, false);
    assert.equal(validateNewExpense({ amountCents: -50, reason: 'x' }).ok, false);
    assert.equal(validateNewExpense({ amountCents: 100, reason: '   ' }).ok, false);
  });

  test('a campanha (id solto) é opcional e carimba o nome', () => {
    const r = validateNewExpense({
      amountCents: 100,
      reason: 'x',
      campaignId: 'camp-1',
      campaignName: 'Natal Iluminado',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.campaignId, 'camp-1');
      assert.equal(r.value.campaignName, 'Natal Iluminado');
    }
  });
});

describe('computeBalance / canSpend / summarize', () => {
  test('o saldo é a soma honesta — contribuições menos gastos', () => {
    const balance = computeBalance([{ amountCents: 1000 }], [{ amountCents: 300 }]);
    assert.equal(balance, 700);
  });

  test('⭐ gastar mais do que o saldo é recusado (canSpend)', () => {
    const balance = computeBalance([{ amountCents: 1000 }], []);
    assert.equal(canSpend(balance, 1500), false);
    assert.equal(canSpend(balance, 800), true);
  });

  test('⭐ depois de um gasto válido, o saldo restante ainda barra o excesso', () => {
    let contributions = [{ amountCents: 1000 }];
    let expenses = [{ amountCents: 800 }];
    let balance = computeBalance(contributions, expenses);
    assert.equal(balance, 200);
    assert.equal(canSpend(balance, 300), false);
    assert.equal(canSpend(balance, 200), true);
  });

  test('summarize não inventa número — total contribuído, total gasto, saldo', () => {
    const r = summarize(
      [{ amountCents: 500 }, { amountCents: 500 }],
      [{ amountCents: 400 }],
    );
    assert.deepEqual(r, { totalContributedCents: 1000, totalSpentCents: 400, balanceCents: 600 });
  });
});
