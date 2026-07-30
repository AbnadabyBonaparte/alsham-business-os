import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeAssets, validateNewAsset } from './assets.ts';

const HOJE = '2026-07-30';

describe('validateNewAsset', () => {
  test('o mínimo honesto: nome, etiqueta e onde está', () => {
    const r = validateNewAsset(
      { name: 'Betoneira 400L', code: 'ETQ-007', originalLocation: 'obra 2' },
      HOJE,
    );
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.writeOffReason, '');
    }
  });

  test('⛔ sem etiqueta não há bem — é ela que o livro segue', () => {
    const r = validateNewAsset({ name: 'X', originalLocation: 'y' }, HOJE);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'code'));
  });

  test('⛔ sem lugar não há cadastro — bem sem lugar é boato', () => {
    const r = validateNewAsset({ name: 'X', code: 'E-1' }, HOJE);
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'originalLocation'));
  });

  test('⭐ valor e moeda andam JUNTOS — ou nenhum', () => {
    const soValor = validateNewAsset(
      { name: 'X', code: 'E-1', originalLocation: 'y', acquisitionCostCents: 120000 },
      HOJE,
    );
    assert.equal(soValor.ok, false);

    const soMoeda = validateNewAsset(
      { name: 'X', code: 'E-1', originalLocation: 'y', currency: 'BRL' },
      HOJE,
    );
    assert.equal(soMoeda.ok, false);

    const juntos = validateNewAsset(
      { name: 'X', code: 'E-1', originalLocation: 'y', acquisitionCostCents: 120000, currency: 'brl' },
      HOJE,
    );
    assert.equal(juntos.ok, true);
    if (juntos.ok) assert.equal(juntos.value.currency, 'BRL');
  });

  test('⭐ aquisição é fato consumado — o futuro é recusado', () => {
    const futuro = validateNewAsset(
      { name: 'X', code: 'E-1', originalLocation: 'y', acquiredOn: '2026-08-01' },
      HOJE,
    );
    assert.equal(futuro.ok, false);
    if (!futuro.ok) assert.match(futuro.problems[0]!.message, /futuro/);

    const passado = validateNewAsset(
      { name: 'X', code: 'E-1', originalLocation: 'y', acquiredOn: '2024-01-15' },
      HOJE,
    );
    assert.equal(passado.ok, true);

    const torto = validateNewAsset(
      { name: 'X', code: 'E-1', originalLocation: 'y', acquiredOn: '15/01/2024' },
      HOJE,
    );
    assert.equal(torto.ok, false);
  });
});

describe('summarizeAssets', () => {
  test('conta o livro sem inventar número', () => {
    const r = summarizeAssets([
      {
        id: 'a',
        name: 'A',
        code: 'E-1',
        description: '',
        categoryId: null,
        originalLocation: 'x',
        acquisitionCostCents: null,
        currency: null,
        acquiredOn: null,
        status: 'active',
        writtenOffAt: null,
        writeOffReason: '',
      },
      {
        id: 'b',
        name: 'B',
        code: 'E-2',
        description: '',
        categoryId: null,
        originalLocation: 'x',
        acquisitionCostCents: null,
        currency: null,
        acquiredOn: null,
        status: 'written_off',
        writtenOffAt: '2026-07-01T00:00:00Z',
        writeOffReason: 'sucata',
      },
    ]);
    assert.deepEqual(r, { total: 2, active: 1, writtenOff: 1 });
  });
});
