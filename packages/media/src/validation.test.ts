import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeShelf, validateNewAsset } from './media.ts';
import type { MediaAsset, MediaUsage } from './types.ts';

function obra(over: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'a1',
    title: 'Obra',
    description: '',
    assetType: '',
    location: 'drive',
    status: 'active',
    ...over,
  };
}

describe('validateNewAsset', () => {
  test('o mínimo honesto: título e o ONDE VIVE — tipo e descrição podem faltar', () => {
    const r = validateNewAsset({ title: 'Logo dourado', location: 'drive da agência' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.assetType, '');
      assert.equal(r.value.description, '');
    }
  });

  test('⛔ sem o onde-vive não há catálogo', () => {
    const r = validateNewAsset({ title: 'X' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.problems[0]!.message, /Onde a obra vive/);
  });

  test('⛔ sem título não há obra', () => {
    const r = validateNewAsset({ location: 'drive' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
  });
});

describe('summarizeShelf', () => {
  test('conta o acervo sem inventar número', () => {
    const usos: MediaUsage[] = [
      { id: 'u1', seq: 1, assetId: 'a1', usedIn: 'x', note: '', referenceId: null, usedAt: 't' },
    ];
    const r = summarizeShelf([obra(), obra({ id: 'a2', status: 'archived' })], usos);
    assert.deepEqual(r, { total: 2, active: 1, archived: 1, usages: 1 });
  });
});
