import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewSupplier } from './vendor.ts';

describe('validateNewSupplier — o cadastro de um fornecedor', () => {
  test('um fornecedor bom passa, nasce ativo, com id vazio (o servidor carimba)', () => {
    const r = validateNewSupplier({ name: '  Aço Bonaparte  ', segment: '  metais  ' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.name, 'Aço Bonaparte'); // trim
      assert.equal(r.value.segment, 'metais');
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ o segmento é OPCIONAL — sem categoria vira vazio, não erro', () => {
    const semSegmento = validateNewSupplier({ name: 'Fornecedor Solo' });
    assert.equal(semSegmento.ok, true);
    if (semSegmento.ok) assert.equal(semSegmento.value.segment, '');

    const segmentoBranco = validateNewSupplier({ name: 'Fornecedor Solo', segment: '   ' });
    assert.equal(segmentoBranco.ok, true);
    if (segmentoBranco.ok) assert.equal(segmentoBranco.value.segment, '');
  });

  test('sem nome: recusada, com o campo apontado', () => {
    for (const name of [undefined, null, '', '   ', 42]) {
      const r = validateNewSupplier({ name });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
    }
  });

  test('nome longo demais é recusado no campo name', () => {
    const r = validateNewSupplier({ name: 'x'.repeat(201) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });

  test('segmento longo demais é recusado no campo segment', () => {
    const r = validateNewSupplier({ name: 'ok', segment: 'y'.repeat(121) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'segment'));
  });
});
