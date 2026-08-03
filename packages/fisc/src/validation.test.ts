import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarize, validateNewTarget, validateNewInspection } from './fisc.ts';
import type { Target, Inspection } from './types.ts';

function alvo(over: Partial<Target> = {}): Target {
  return { id: 't1', name: 'Padaria da Praça', status: 'active', ...over };
}

function vistoria(over: Partial<Inspection> = {}): Inspection {
  return {
    id: 'i1',
    targetId: 't1',
    targetName: 'Padaria da Praça',
    inspectedAt: '2026-08-03T10:00:00.000Z',
    finding: '',
    ...over,
  };
}

describe('validateNewTarget', () => {
  test('o mínimo honesto: o nome', () => {
    const r = validateNewTarget({ name: 'Mercado Central' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.status, 'active');
  });

  test('⛔ sem nome não cadastra', () => {
    assert.equal(validateNewTarget({}).ok, false);
    assert.equal(validateNewTarget({ name: '   ' }).ok, false);
  });

  test('nome além do limite é recusado', () => {
    const r = validateNewTarget({ name: 'x'.repeat(201) });
    assert.equal(r.ok, false);
  });
});

describe('validateNewInspection', () => {
  test('o mínimo honesto: o alvo', () => {
    const r = validateNewInspection({ targetId: 't1' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.targetId, 't1');
      assert.equal(r.value.finding, '');
    }
  });

  test('⛔ sem alvo não registra a vistoria', () => {
    assert.equal(validateNewInspection({}).ok, false);
    assert.equal(validateNewInspection({ finding: 'dentro das normas' }).ok, false);
  });

  test('o achado é texto livre e opcional', () => {
    const r = validateNewInspection({ targetId: 't1', finding: 'alvará vencido' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.finding, 'alvará vencido');
  });

  test('⛔ validateNewInspection nunca aceita inspectedAt/inspectedBy do formulário', () => {
    // O tipo de entrada nem tem estes campos — o carimbo é 100% do servidor.
    const r = validateNewInspection({ targetId: 't1' } as Record<string, unknown>);
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.ok(!Object.prototype.hasOwnProperty.call(r.value, 'inspectedAt'));
      assert.ok(!Object.prototype.hasOwnProperty.call(r.value, 'inspectedBy'));
    }
  });
});

describe('summarize', () => {
  test('conta o placar sem inventar número', () => {
    const r = summarize(
      [alvo({ status: 'active' }), alvo({ id: 't2', status: 'active' }), alvo({ id: 't3', status: 'archived' })],
      [vistoria(), vistoria({ id: 'i2' })],
    );
    assert.deepEqual(r, {
      totalTargets: 3,
      activeTargets: 2,
      archivedTargets: 1,
      totalInspections: 2,
    });
  });
});
