import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewAsset, isAssetType } from './ip.ts';

const SRC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('validateNewAsset — um ativo de PI novo', () => {
  test('um ativo bom passa, nasce FILED, com id vazio', () => {
    const r = validateNewAsset({
      title: '  Motor solar modular  ',
      assetType: 'patent',
      registrationNumber: '  BR102026000001  ',
      filedOn: '2026-07-31',
      sourceId: `  ${SRC}  `,
      sourceName: '  Ideia: motor solar  ',
      note: '  escopo 1  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.title, 'Motor solar modular');
      assert.equal(r.value.assetType, 'patent');
      assert.equal(r.value.registrationNumber, 'BR102026000001');
      assert.equal(r.value.filedOn, '2026-07-31');
      assert.equal(r.value.sourceId, SRC);
      assert.equal(r.value.sourceName, 'Ideia: motor solar');
      assert.equal(r.value.status, 'filed');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ número de registro, data, origem e nota são OPCIONAIS', () => {
    const r = validateNewAsset({ title: 'Marca X', assetType: 'trademark' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.registrationNumber, '');
      assert.equal(r.value.filedOn, null);
      assert.equal(r.value.sourceId, null);
      assert.equal(r.value.note, '');
    }
  });

  test('⭐⭐ as QUATRO categorias passam — e só elas', () => {
    for (const assetType of ['patent', 'trademark', 'copyright', 'trade_secret']) {
      const r = validateNewAsset({ title: 'X', assetType });
      assert.equal(r.ok, true, `${assetType} deveria passar`);
    }
    for (const assetType of ['design', 'marca', 'PATENT', '', undefined, 7]) {
      const r = validateNewAsset({ title: 'X', assetType });
      assert.equal(r.ok, false, `${String(assetType)} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'assetType'));
    }
  });

  test('isAssetType reconhece exatamente as quatro categorias', () => {
    assert.equal(isAssetType('patent'), true);
    assert.equal(isAssetType('trade_secret'), true);
    assert.equal(isAssetType('design'), false);
    assert.equal(isAssetType(3), false);
  });

  test('⭐ o título é OBRIGATÓRIO', () => {
    for (const title of [undefined, null, '', '   ', 42]) {
      const r = validateNewAsset({ title, assetType: 'patent' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
    }
  });

  test('data de depósito inválida (formato ou calendário) é recusada', () => {
    for (const filedOn of ['31/07/2026', '2026-7-1', 'ontem', '2026-02-30']) {
      const r = validateNewAsset({ title: 'X', assetType: 'patent', filedOn });
      assert.equal(r.ok, false, `data=${filedOn} deveria ser recusada`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'filedOn'));
    }
  });

  test('título / número / nota longos demais são recusados no campo certo', () => {
    const longoT = validateNewAsset({ title: 'x'.repeat(201), assetType: 'patent' });
    assert.equal(longoT.ok, false);
    if (!longoT.ok) assert.ok(longoT.problems.some((p) => p.field === 'title'));

    const longoR = validateNewAsset({ title: 'X', assetType: 'patent', registrationNumber: 'r'.repeat(121) });
    assert.equal(longoR.ok, false);
    if (!longoR.ok) assert.ok(longoR.problems.some((p) => p.field === 'registrationNumber'));

    const longaN = validateNewAsset({ title: 'X', assetType: 'patent', note: 'z'.repeat(1001) });
    assert.equal(longaN.ok, false);
    if (!longaN.ok) assert.ok(longaN.problems.some((p) => p.field === 'note'));
  });
});
