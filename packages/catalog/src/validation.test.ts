import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewProduct, summarizeProducts } from './catalog.ts';
import type { Product } from './types.ts';

function prod(over: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    name: 'Pão francês',
    sku: '',
    priceCents: 100,
    currency: 'BRL',
    status: 'active',
    ...over,
  };
}

describe('validateNewProduct — o cadastro de um produto', () => {
  test('um produto bom passa, nasce ATIVO, com id vazio', () => {
    const r = validateNewProduct({
      name: '  Pão francês  ',
      sku: '  789100  ',
      priceCents: 150,
      currency: 'brl',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.name, 'Pão francês');
      assert.equal(r.value.sku, '789100');
      assert.equal(r.value.priceCents, 150);
      assert.equal(r.value.currency, 'BRL');
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ o nome é OBRIGATÓRIO', () => {
    for (const name of [undefined, null, '', '   ', 42]) {
      const r = validateNewProduct({ name, priceCents: 100 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
    }
  });

  test('⭐ o SKU é OPCIONAL — ausente vira string vazia', () => {
    const r = validateNewProduct({ name: 'Sal', priceCents: 200 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.sku, '');
  });

  test('⭐ o preço 0 é PERMITIDO (um brinde é honesto)', () => {
    const r = validateNewProduct({ name: 'Amostra grátis', priceCents: 0 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.priceCents, 0);
  });

  test('⛔ o preço NEGATIVO é recusado', () => {
    const r = validateNewProduct({ name: 'Erro', priceCents: -1 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'priceCents'));
  });

  test('preço não-inteiro é recusado', () => {
    const r = validateNewProduct({ name: 'Erro', priceCents: 1.5 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'priceCents'));
  });

  test('⛔ moeda com comprimento errado é recusada', () => {
    for (const currency of ['RE', 'REAL', 'B']) {
      const r = validateNewProduct({ name: 'X', priceCents: 100, currency });
      assert.equal(r.ok, false, `currency=${currency} deveria ser recusada`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'currency'));
    }
  });
});

describe('summarizeProducts — a leitura do catálogo', () => {
  test('conta por estado — todo número é length', () => {
    const lista = [
      prod({ status: 'active' }),
      prod({ status: 'active' }),
      prod({ status: 'archived' }),
    ];
    assert.deepEqual(summarizeProducts(lista), { total: 3, active: 2, archived: 1 });
    assert.deepEqual(summarizeProducts([]), { total: 0, active: 0, archived: 0 });
  });
});
