import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarize, validateNewCheckpoint, validateNewPatrol } from './sec.ts';
import type { Checkpoint, Patrol } from './types.ts';

function posto(over: Partial<Checkpoint> = {}): Checkpoint {
  return { id: 'c1', name: 'Portaria Norte', status: 'active', ...over };
}

function ronda(over: Partial<Patrol> = {}): Patrol {
  return {
    id: 'p1',
    checkpointId: 'c1',
    checkpointName: 'Portaria Norte',
    passedAt: '2026-07-30T10:00:00.000Z',
    note: '',
    ...over,
  };
}

describe('validateNewCheckpoint', () => {
  test('o mínimo honesto: o nome', () => {
    const r = validateNewCheckpoint({ name: 'Portaria Sul' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.status, 'active');
  });

  test('⛔ sem nome não cadastra', () => {
    assert.equal(validateNewCheckpoint({}).ok, false);
    assert.equal(validateNewCheckpoint({ name: '   ' }).ok, false);
  });

  test('nome além do limite é recusado', () => {
    const r = validateNewCheckpoint({ name: 'x'.repeat(201) });
    assert.equal(r.ok, false);
  });
});

describe('validateNewPatrol', () => {
  test('o mínimo honesto: o posto', () => {
    const r = validateNewPatrol({ checkpointId: 'c1' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.checkpointId, 'c1');
      assert.equal(r.value.note, '');
    }
  });

  test('⛔ sem posto não registra a ronda', () => {
    assert.equal(validateNewPatrol({}).ok, false);
    assert.equal(validateNewPatrol({ note: 'tudo normal' }).ok, false);
  });

  test('a nota é texto livre e opcional', () => {
    const r = validateNewPatrol({ checkpointId: 'c1', note: 'portão B travado' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.note, 'portão B travado');
  });

  test('⛔ validateNewPatrol nunca aceita passedAt/passedBy do formulário', () => {
    // O tipo de entrada nem tem estes campos — o carimbo é 100% do servidor.
    const r = validateNewPatrol({ checkpointId: 'c1' } as Record<string, unknown>);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.ok(!Object.prototype.hasOwnProperty.call(r.value, 'passedAt'));
      assert.ok(!Object.prototype.hasOwnProperty.call(r.value, 'passedBy'));
    }
  });
});

describe('summarize', () => {
  test('conta o placar sem inventar número', () => {
    const r = summarize(
      [posto({ status: 'active' }), posto({ id: 'c2', status: 'active' }), posto({ id: 'c3', status: 'archived' })],
      [ronda(), ronda({ id: 'p2' })],
    );
    assert.deepEqual(r, {
      totalCheckpoints: 3,
      activeCheckpoints: 2,
      archivedCheckpoints: 1,
      totalPatrols: 2,
    });
  });
});
