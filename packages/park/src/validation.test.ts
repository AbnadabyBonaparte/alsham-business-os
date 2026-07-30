import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarize, validateNewEntry } from './park.ts';
import type { ParkEntry } from './types.ts';

function entrada(over: Partial<ParkEntry> = {}): ParkEntry {
  return {
    id: 'e1',
    vehiclePlate: 'ABC1D23',
    enteredAt: '2026-07-30T10:00:00.000Z',
    exitedAt: null,
    fee: '',
    ...over,
  };
}

describe('validateNewEntry', () => {
  test('o mínimo honesto: só a placa/identificador', () => {
    const r = validateNewEntry({ vehiclePlate: 'ABC1D23' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.fee, '');
  });

  test('⛔ sem placa/identificador não registra', () => {
    assert.equal(validateNewEntry({}).ok, false);
    assert.equal(validateNewEntry({ vehiclePlate: '   ' }).ok, false);
  });

  test('a tarifa é OPCIONAL em texto — o tenant decide se cobra, sem cálculo aqui', () => {
    const r = validateNewEntry({ vehiclePlate: 'XYZ9Z99', fee: 'R$ 10,00/hora' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.fee, 'R$ 10,00/hora');
  });

  test('placa/identificador com espaços é aparado', () => {
    const r = validateNewEntry({ vehiclePlate: '  ABC1D23  ' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.vehiclePlate, 'ABC1D23');
  });
});

describe('summarize', () => {
  test('conta o pátio por estado sem inventar número', () => {
    const r = summarize([
      entrada({ id: 'a' }),
      entrada({ id: 'b' }),
      entrada({ id: 'c', exitedAt: '2026-07-30T12:00:00.000Z' }),
    ]);
    assert.deepEqual(r, { total: 3, inside: 2, exited: 1 });
  });

  test('pátio vazio não inventa número', () => {
    assert.deepEqual(summarize([]), { total: 0, inside: 0, exited: 0 });
  });
});
