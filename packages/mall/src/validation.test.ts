import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeStores, validateNewStore } from './mall.ts';
import type { Store } from './types.ts';

function loja(over: Partial<Store> = {}): Store {
  return {
    id: 's1',
    storeName: 'Loja do Térreo',
    segment: 'moda',
    spaceId: null,
    spaceName: '',
    status: 'active',
    ...over,
  };
}

describe('validateNewStore', () => {
  test('o mínimo honesto: nome e segmento', () => {
    const r = validateNewStore({ storeName: 'Loja X', segment: 'alimentação' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.status, 'active');
  });

  test('⛔ sem nome ou sem segmento não cadastra', () => {
    assert.equal(validateNewStore({ segment: 'moda' }).ok, false);
    assert.equal(validateNewStore({ storeName: 'Loja X' }).ok, false);
  });

  test('a unidade física (id solto) é opcional e carimba o nome', () => {
    const r = validateNewStore({ storeName: 'Loja X', segment: 'moda' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.spaceId, null);
      assert.equal(r.value.spaceName, '');
    }
    const rv = validateNewStore({ storeName: 'Loja X', segment: 'moda', spaceId: 'sp-1', spaceName: 'Loja 42 — Piso L1' });
    assert.equal(rv.ok, true);
    if (rv.ok) {
      assert.equal(rv.value.spaceId, 'sp-1');
      assert.equal(rv.value.spaceName, 'Loja 42 — Piso L1');
    }
  });
});

describe('summarizeStores', () => {
  test('conta o mapa por estado sem inventar número', () => {
    const r = summarizeStores([
      loja({ status: 'active' }),
      loja({ id: 's2', status: 'active' }),
      loja({ id: 's3', status: 'archived' }),
    ]);
    assert.deepEqual(r, { total: 3, active: 2, archived: 1 });
  });
});
