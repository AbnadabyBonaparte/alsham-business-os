import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewRequest } from './rfq.ts';

describe('validateNewRequest — a abertura de uma cotação', () => {
  test('uma cotação boa passa, nasce draft, sem vencedor, com id vazio (o servidor carimba)', () => {
    const r = validateNewRequest({
      title: '  Cimento para a obra  ',
      description: '  três marcas  ',
      lines: [{ item: '  CP-II  ', quantity: '  50  ', unit: '  saca  ' }],
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.title, 'Cimento para a obra'); // trim
      assert.equal(r.value.description, 'três marcas');
      assert.equal(r.value.status, 'draft');
      assert.equal(r.value.awardedSupplierId, null);
      assert.equal(r.value.awardedSupplierName, '');
      assert.equal(r.value.cancelReason, '');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
      assert.equal(r.value.lines.length, 1);
      assert.deepEqual(r.value.lines[0], { lineNo: 1, item: 'CP-II', quantity: 50, unit: 'saca' });
    }
  });

  test('⭐ a descrição e a unidade são OPCIONAIS — sem elas vira vazio, não erro', () => {
    const r = validateNewRequest({ title: 'Serviço de limpeza', lines: [{ item: 'Diária', quantity: 4 }] });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.description, '');
      assert.equal(r.value.lines[0]!.unit, '');
    }
  });

  test('sem título: recusada, com o campo apontado', () => {
    for (const title of [undefined, null, '', '   ', 42]) {
      const r = validateNewRequest({ title, lines: [{ item: 'x', quantity: 1 }] });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
    }
  });

  test('⛔ cotação sem item não vai ao mercado', () => {
    for (const lines of [undefined, null, [], 'nope']) {
      const r = validateNewRequest({ title: 'ok', lines });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'lines'));
    }
  });

  test('⭐ item inválido reporta o erro COM o índice (lines.0.quantity)', () => {
    const r = validateNewRequest({
      title: 'ok',
      lines: [
        { item: 'bom', quantity: 3 },
        { item: '', quantity: 0 },
      ],
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.problems.some((p) => p.field === 'lines.1.item'));
      assert.ok(r.problems.some((p) => p.field === 'lines.1.quantity'));
    }
  });

  test('quantidade não-positiva é recusada no item', () => {
    for (const quantity of [0, -1, 'abc', null]) {
      const r = validateNewRequest({ title: 'ok', lines: [{ item: 'x', quantity }] });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'lines.0.quantity'));
    }
  });

  test('título longo demais é recusado no campo title', () => {
    const r = validateNewRequest({ title: 'x'.repeat(201), lines: [{ item: 'x', quantity: 1 }] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
  });
});
