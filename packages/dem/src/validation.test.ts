import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewPlan } from './dem.ts';

describe('validateNewPlan — um plano de demanda novo', () => {
  test('um plano bom passa, nasce draft, com id vazio (o servidor carimba)', () => {
    const r = validateNewPlan({
      period: '  Q1 2027  ',
      title: '  Plano trimestral  ',
      lines: [{ product: '  Cimento CP-II  ', quantity: 100, unit: '  sc  ' }],
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.period, 'Q1 2027'); // trim
      assert.equal(r.value.title, 'Plano trimestral');
      assert.equal(r.value.status, 'draft');
      assert.equal(r.value.id, '');
      assert.equal(r.value.lines.length, 1);
      assert.equal(r.value.lines[0]!.product, 'Cimento CP-II');
      assert.equal(r.value.lines[0]!.quantity, 100);
      assert.equal(r.value.lines[0]!.unit, 'sc');
      assert.equal(r.value.lines[0]!.lineNo, 1);
    }
  });

  test('⭐ o título é OPCIONAL — sem título vira vazio, não erro; a unidade também', () => {
    const r = validateNewPlan({ period: 'Março/2027', lines: [{ product: 'Aço', quantity: 5 }] });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.title, '');
      assert.equal(r.value.lines[0]!.unit, '');
    }
  });

  test('sem período: recusado, com o campo apontado', () => {
    for (const period of [undefined, null, '', '   ', 42]) {
      const r = validateNewPlan({ period, lines: [{ product: 'x', quantity: 1 }] });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'period'));
    }
  });

  test('⭐ plano sem linha é recusado — plano vazio não vai à cadeia', () => {
    for (const lines of [undefined, null, [], 'nope']) {
      const r = validateNewPlan({ period: 'Q1 2027', lines });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'lines'));
    }
  });

  test('linha com quantidade <= 0 é recusada, com o índice no campo', () => {
    const r = validateNewPlan({
      period: 'Q1 2027',
      lines: [{ product: 'Aço', quantity: 0 }, { product: 'Cimento', quantity: -3 }],
    });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.problems.some((p) => p.field === 'lines.0.quantity'));
      assert.ok(r.problems.some((p) => p.field === 'lines.1.quantity'));
    }
  });

  test('linha sem produto é recusada no campo do índice', () => {
    const r = validateNewPlan({ period: 'Q1 2027', lines: [{ quantity: 10 }] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'lines.0.product'));
  });

  test('período longo demais é recusado no campo period', () => {
    const r = validateNewPlan({ period: 'x'.repeat(121), lines: [{ product: 'a', quantity: 1 }] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'period'));
  });
});
