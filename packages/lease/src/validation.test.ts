import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarize, validateNewAgreement, validateNewReport } from './lease.ts';
import type { Agreement } from './types.ts';

function locacao(over: Partial<Agreement> = {}): Agreement {
  return {
    id: 'a1',
    contractId: 'ctr-1',
    contractRef: 'Contrato 042',
    storeId: 'store-1',
    storeName: 'Ateliê da Praça',
    revenueShare: '8% sobre vendas',
    status: 'active',
    endReason: '',
    endedAt: null,
    ...over,
  };
}

describe('validateNewAgreement', () => {
  test('o mínimo honesto: contrato e loja (ids soltos)', () => {
    const r = validateNewAgreement({ contractId: 'ctr-1', storeId: 'store-1' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.contractId, 'ctr-1');
      assert.equal(r.value.storeId, 'store-1');
      assert.equal(r.value.revenueShare, '');
    }
  });

  test('⛔ sem contractId ou sem storeId não registra — é o que este módulo existe para amarrar', () => {
    assert.equal(validateNewAgreement({ storeId: 'store-1' }).ok, false);
    assert.equal(validateNewAgreement({ contractId: 'ctr-1' }).ok, false);
    assert.equal(validateNewAgreement({}).ok, false);
  });

  test('revenueShare é TEXTO LIVRE opcional — o sistema não calcula nada', () => {
    const r = validateNewAgreement({
      contractId: 'ctr-1',
      storeId: 'store-1',
      revenueShare: '8% sobre vendas acima de R$ 10.000',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.revenueShare, '8% sobre vendas acima de R$ 10.000');
  });

  test('contractRef e storeName carimbam o nome pela tela', () => {
    const r = validateNewAgreement({
      contractId: 'ctr-1',
      contractRef: 'Contrato 042 — Piso L1',
      storeId: 'store-1',
      storeName: 'Ateliê da Praça',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.contractRef, 'Contrato 042 — Piso L1');
      assert.equal(r.value.storeName, 'Ateliê da Praça');
    }
  });
});

describe('validateNewReport', () => {
  test('o mínimo honesto: agreementId, competência e valor', () => {
    const r = validateNewReport({ agreementId: 'a1', competency: '2026-07-01', reportedAmountCents: 150000 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.reportedAmountCents, 150000);
      assert.equal(r.value.currency, null);
    }
  });

  test('⛔ sem competência ou sem valor não registra — a linha muda que o ctr já recusou', () => {
    assert.equal(validateNewReport({ agreementId: 'a1', reportedAmountCents: 100 }).ok, false);
    assert.equal(validateNewReport({ agreementId: 'a1', competency: '2026-07-01' }).ok, false);
    assert.equal(validateNewReport({ agreementId: 'a1', competency: '2026-07-01', reportedAmountCents: -1 }).ok, false);
  });

  test('moeda, quando informada, precisa ter três letras maiúsculas', () => {
    assert.equal(
      validateNewReport({ agreementId: 'a1', competency: '2026-07-01', reportedAmountCents: 100, currency: 'brl' }).ok,
      false,
    );
    const r = validateNewReport({
      agreementId: 'a1',
      competency: '2026-07-01',
      reportedAmountCents: 100,
      currency: 'BRL',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.currency, 'BRL');
  });

  test('valor zero é permitido — mês sem venda é fato honesto', () => {
    const r = validateNewReport({ agreementId: 'a1', competency: '2026-07-01', reportedAmountCents: 0 });
    assert.equal(r.ok, true);
  });
});

describe('summarize', () => {
  test('conta o mapa por estado sem inventar número', () => {
    const r = summarize([
      locacao({ status: 'active' }),
      locacao({ id: 'a2', status: 'active' }),
      locacao({ id: 'a3', status: 'ended' }),
    ]);
    assert.deepEqual(r, { total: 3, active: 2, ended: 1 });
  });
});
