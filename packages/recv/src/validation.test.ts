import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewReceipt } from './recv.ts';

describe('validateNewReceipt — o registro de um recebimento', () => {
  test('um recebimento bom passa, nasce com id vazio (o servidor carimba quem/quando)', () => {
    const r = validateNewReceipt({
      item: '  Parafusos M6  ',
      quantity: 500,
      receivedOn: '2026-07-31',
      orderRef: '  PO-1042  ',
      note: '  1 caixa amassada  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.item, 'Parafusos M6'); // trim
      assert.equal(r.value.quantity, 500);
      assert.equal(r.value.receivedOn, '2026-07-31');
      assert.equal(r.value.orderRef, 'PO-1042');
      assert.equal(r.value.note, '1 caixa amassada');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ o pedido é OPCIONAL — recebimento sem pedido é honesto (doação, amostra)', () => {
    const r = validateNewReceipt({ item: 'Amostra grátis', quantity: 1, receivedOn: '2026-07-31' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.orderId, null);
      assert.equal(r.value.orderRef, '');
      assert.equal(r.value.note, '');
    }
  });

  test('⭐⭐ receber a maior é PERMITIDO — não há teto de quantidade (o paralelo recv × ar)', () => {
    const r = validateNewReceipt({ item: 'Caixas', quantity: 9_999_999, receivedOn: '2026-07-31' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.quantity, 9_999_999);
  });

  test('sem item: recusado, com o campo apontado', () => {
    for (const item of [undefined, null, '', '   ', 42]) {
      const r = validateNewReceipt({ item, quantity: 1, receivedOn: '2026-07-31' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'item'));
    }
  });

  test('quantidade inválida (não número, zero, negativa, NaN) é recusada', () => {
    for (const quantity of [undefined, 'muitos', 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = validateNewReceipt({ item: 'ok', quantity, receivedOn: '2026-07-31' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'quantity'));
    }
  });

  test('dia ausente ou fora do formato ISO é recusado', () => {
    for (const receivedOn of [undefined, '', '31/07/2026', '2026-7-1', 'ontem']) {
      const r = validateNewReceipt({ item: 'ok', quantity: 1, receivedOn });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'receivedOn'));
    }
  });

  test('⭐ passado é permitido — quem registra hoje o que chegou ontem não erra', () => {
    const r = validateNewReceipt({ item: 'ok', quantity: 1, receivedOn: '2020-01-01' });
    assert.equal(r.ok, true);
  });

  test('item / referência / nota longos demais são recusados no campo certo', () => {
    const longoItem = validateNewReceipt({ item: 'x'.repeat(301), quantity: 1, receivedOn: '2026-07-31' });
    assert.equal(longoItem.ok, false);
    if (!longoItem.ok) assert.ok(longoItem.problems.some((p) => p.field === 'item'));

    const longoRef = validateNewReceipt({ item: 'ok', quantity: 1, receivedOn: '2026-07-31', orderRef: 'y'.repeat(121) });
    assert.equal(longoRef.ok, false);
    if (!longoRef.ok) assert.ok(longoRef.problems.some((p) => p.field === 'orderRef'));

    const longaNota = validateNewReceipt({ item: 'ok', quantity: 1, receivedOn: '2026-07-31', note: 'z'.repeat(1001) });
    assert.equal(longaNota.ok, false);
    if (!longaNota.ok) assert.ok(longaNota.problems.some((p) => p.field === 'note'));
  });
});
