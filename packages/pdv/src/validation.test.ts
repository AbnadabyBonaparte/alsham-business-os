import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewSale, validateNewItem, computeTotals } from './pdv.ts';
import type { SaleItem } from './types.ts';

describe('validateNewSale — a abertura de uma venda', () => {
  test('uma venda boa passa, nasce draft, id vazio (o servidor carimba)', () => {
    const r = validateNewSale({
      operator: '  Caixa 3  ',
      paymentMethod: '  pix  ',
      customerId: '  c-1  ',
      customerName: '  Fulano  ',
      discountCents: 500,
      currency: '  BRL  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.operator, 'Caixa 3'); // trim
      assert.equal(r.value.paymentMethod, 'pix');
      assert.equal(r.value.customerId, 'c-1');
      assert.equal(r.value.customerName, 'Fulano');
      assert.equal(r.value.discountCents, 500);
      assert.equal(r.value.currency, 'BRL');
      assert.equal(r.value.status, 'draft');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ o cliente é OPCIONAL — sem ele a venda é anônima (customerId null)', () => {
    const r = validateNewSale({ currency: 'BRL' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.customerId, null);
      assert.equal(r.value.customerName, '');
      assert.equal(r.value.operator, '');
      assert.equal(r.value.paymentMethod, '');
      assert.equal(r.value.discountCents, 0);
    }
  });

  test('sem moeda: recusada, com o campo apontado', () => {
    for (const currency of [undefined, null, '', '   ', 42]) {
      const r = validateNewSale({ currency });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'currency'));
    }
  });

  test('desconto negativo é recusado no campo discountCents', () => {
    for (const discountCents of [-1, -100, 1.5, 'abc']) {
      const r = validateNewSale({ currency: 'BRL', discountCents });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'discountCents'));
    }
  });

  test('desconto zero é aceito (a Promoção como campo, sem desconto)', () => {
    const r = validateNewSale({ currency: 'BRL', discountCents: 0 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.discountCents, 0);
  });
});

describe('validateNewItem — uma linha da venda', () => {
  test('um item bom passa, com produto por id solto', () => {
    const r = validateNewItem({
      productId: '  p-1  ',
      productName: '  Arroz 5kg  ',
      quantity: '  2  ',
      unitPriceCents: 2599,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.productId, 'p-1');
      assert.equal(r.value.productName, 'Arroz 5kg'); // trim
      assert.equal(r.value.quantity, 2);
      assert.equal(r.value.unitPriceCents, 2599);
      assert.equal(r.value.lineNo, 0); // o servidor carimba a posição
    }
  });

  test('⭐ o produto é OPCIONAL — o preço avulso não vem do catálogo', () => {
    const r = validateNewItem({ productName: 'Banana a granel', quantity: 1.25, unitPriceCents: 399 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.productId, null);
  });

  test('sem nome do produto: recusado, a linha precisa dizer o que vendeu', () => {
    for (const productName of [undefined, null, '', '   ', 7]) {
      const r = validateNewItem({ productName, quantity: 1, unitPriceCents: 100 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'productName'));
    }
  });

  test('quantidade não-positiva é recusada', () => {
    for (const quantity of [0, -1, 'abc', null]) {
      const r = validateNewItem({ productName: 'x', quantity, unitPriceCents: 100 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'quantity'));
    }
  });

  test('preço unitário negativo (ou não-inteiro) é recusado', () => {
    for (const unitPriceCents of [-1, -100, 1.5, 'abc', null]) {
      const r = validateNewItem({ productName: 'x', quantity: 1, unitPriceCents });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'unitPriceCents'));
    }
  });

  test('preço zero é aceito (brinde/cortesia)', () => {
    const r = validateNewItem({ productName: 'Brinde', quantity: 1, unitPriceCents: 0 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.unitPriceCents, 0);
  });
});

describe('computeTotals — o total calculado das linhas (espelho da VIEW)', () => {
  const itens = (over: Partial<SaleItem>[] = []): SaleItem[] =>
    over.map((o, i) => ({
      lineNo: i + 1,
      productId: null,
      productName: 'x',
      quantity: 1,
      unitPriceCents: 0,
      ...o,
    }));

  test('bruto = Σ quantidade × preço; líquido = bruto − desconto', () => {
    const items = itens([
      { quantity: 2, unitPriceCents: 1000 }, // 2000
      { quantity: 3, unitPriceCents: 500 }, // 1500
    ]);
    const t = computeTotals(items, 500);
    assert.equal(t.grossCents, 3500);
    assert.equal(t.discountCents, 500);
    assert.equal(t.netCents, 3000);
    assert.equal(t.itemCount, 2);
  });

  test('⭐ desconto maior que o bruto trava o líquido em zero (nunca negativo)', () => {
    const items = itens([{ quantity: 1, unitPriceCents: 1000 }]);
    const t = computeTotals(items, 5000);
    assert.equal(t.grossCents, 1000);
    assert.equal(t.netCents, 0);
  });

  test('venda vazia: tudo zero', () => {
    const t = computeTotals([], 0);
    assert.deepEqual(t, { grossCents: 0, discountCents: 0, netCents: 0, itemCount: 0 });
  });

  test('desconto negativo/inválido é tratado como zero', () => {
    const items = itens([{ quantity: 1, unitPriceCents: 1000 }]);
    assert.equal(computeTotals(items, -100).netCents, 1000);
    assert.equal(computeTotals(items, Number.NaN).netCents, 1000);
  });
});
