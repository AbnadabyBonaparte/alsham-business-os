import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewRule } from './reorder.ts';

describe('validateNewRule — o cadastro de uma regra de estoque mínimo', () => {
  test('uma regra boa passa, nasce ativa, com id vazio (o servidor carimba)', () => {
    const r = validateNewRule({
      product: '  Parafuso 8mm  ',
      invItemId: '  item-123  ',
      invItemName: '  Parafuso sextavado 8mm  ',
      minimumQuantity: 5,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.product, 'Parafuso 8mm'); // trim
      assert.equal(r.value.invItemId, 'item-123');
      assert.equal(r.value.invItemName, 'Parafuso sextavado 8mm');
      assert.equal(r.value.minimumQuantity, 5); // mantida
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ o vínculo com o item é OPCIONAL — sem item vira null, sem nome vira vazio', () => {
    const semItem = validateNewRule({ product: 'Caixa de papel', minimumQuantity: 10 });
    assert.equal(semItem.ok, true);
    if (semItem.ok) {
      assert.equal(semItem.value.invItemId, null);
      assert.equal(semItem.value.invItemName, '');
    }
  });

  test('minimumQuantity zero é aceito (o ponto de reabastecimento pode ser 0)', () => {
    const r = validateNewRule({ product: 'ok', minimumQuantity: 0 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.minimumQuantity, 0);
  });

  test('⭐ minimumQuantity negativa é recusada no campo minimumQuantity', () => {
    const r = validateNewRule({ product: 'ok', minimumQuantity: -1 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'minimumQuantity'));
  });

  test('minimumQuantity ausente ou não-número é recusada no campo minimumQuantity', () => {
    for (const minimumQuantity of [undefined, null, '5', NaN, Infinity, {}]) {
      const r = validateNewRule({ product: 'ok', minimumQuantity });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'minimumQuantity'));
    }
  });

  test('sem produto: recusada, com o campo apontado', () => {
    for (const product of [undefined, null, '', '   ', 42]) {
      const r = validateNewRule({ product, minimumQuantity: 5 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'product'));
    }
  });

  test('produto longo demais é recusado no campo product', () => {
    const r = validateNewRule({ product: 'x'.repeat(201), minimumQuantity: 5 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'product'));
  });

  test('nome do item longo demais é recusado no campo invItemName', () => {
    const r = validateNewRule({ product: 'ok', minimumQuantity: 5, invItemName: 'y'.repeat(201) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'invItemName'));
  });
});
