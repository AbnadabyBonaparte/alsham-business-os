import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewSession, validateClose } from './cashregister.ts';

describe('validateNewSession — uma sessão nova', () => {
  test('uma sessão boa passa, nasce open, sem contagem de fechamento, id vazio', () => {
    const r = validateNewSession({
      registerName: '  Caixa 1  ',
      operatorId: '  op-123  ',
      operatorName: '  João  ',
      openingAmountCents: 15000,
      currency: 'BRL',
      note: '  troco em moedas  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.registerName, 'Caixa 1');
      assert.equal(r.value.operatorId, 'op-123');
      assert.equal(r.value.operatorName, 'João');
      assert.equal(r.value.openingAmountCents, 15000);
      assert.equal(r.value.currency, 'BRL');
      assert.equal(r.value.status, 'open');
      assert.equal(r.value.closingAmountCents, null);
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ operador é OPCIONAL — ausente vira null, sem nome vira vazio', () => {
    const r = validateNewSession({ registerName: 'Caixa 2', openingAmountCents: 0 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.operatorId, null);
      assert.equal(r.value.operatorName, '');
    }
  });

  test('⭐ fundo de troco 0 é aceito (gaveta vazia é honesto); moeda default BRL', () => {
    const r = validateNewSession({ registerName: 'Caixa 3', openingAmountCents: 0 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.openingAmountCents, 0);
      assert.equal(r.value.currency, 'BRL');
    }
  });

  test('sem caixa (registerName): recusado, com o campo apontado', () => {
    for (const registerName of [undefined, null, '', '   ', 42]) {
      const r = validateNewSession({ registerName, openingAmountCents: 0 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'registerName'));
    }
  });

  test('⛔ fundo de troco negativo é recusado', () => {
    const r = validateNewSession({ registerName: 'C', openingAmountCents: -1 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'openingAmountCents'));
  });

  test('fundo de troco fracionário ou não numérico é recusado', () => {
    for (const v of [10.5, '100', NaN]) {
      const r = validateNewSession({ registerName: 'C', openingAmountCents: v });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'openingAmountCents'));
    }
  });

  test('moeda com tamanho diferente de 3 é recusada', () => {
    const r = validateNewSession({ registerName: 'C', openingAmountCents: 0, currency: 'REAL' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'currency'));
  });
});

describe('validateClose — o fechamento exige a contagem física (Lei 7)', () => {
  test('uma contagem boa passa', () => {
    const r = validateClose({ closingAmountCents: 18050 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.closingAmountCents, 18050);
  });

  test('⭐ contagem 0 é aceita (a gaveta pode fechar zerada)', () => {
    const r = validateClose({ closingAmountCents: 0 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.closingAmountCents, 0);
  });

  test('⛔ sem contagem (ausente ou nula) é recusado — sem número, não fecha', () => {
    for (const v of [undefined, null]) {
      const r = validateClose({ closingAmountCents: v });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'closingAmountCents'));
    }
  });

  test('⛔ contagem negativa ou fracionária é recusada', () => {
    for (const v of [-1, 12.34, '99']) {
      const r = validateClose({ closingAmountCents: v });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'closingAmountCents'));
    }
  });
});
