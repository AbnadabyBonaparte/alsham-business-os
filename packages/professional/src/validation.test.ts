import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarize, validateNewProfessional } from './professional.ts';
import type { Professional } from './types.ts';

function profissional(over: Partial<Professional> = {}): Professional {
  return {
    id: 'p1',
    name: 'Ana Corte',
    specialty: 'cabeleireiro',
    hrEmployeeId: null,
    status: 'active',
    ...over,
  };
}

describe('validateNewProfessional', () => {
  test('o mínimo honesto: só o nome', () => {
    const r = validateNewProfessional({ name: 'Ana Corte' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.name, 'Ana Corte');
      assert.equal(r.value.specialty, '');
      assert.equal(r.value.hrEmployeeId, null);
    }
  });

  test('⛔ sem nome não registra', () => {
    assert.equal(validateNewProfessional({}).ok, false);
    assert.equal(validateNewProfessional({ specialty: 'manicure' }).ok, false);
    assert.equal(validateNewProfessional({ name: '   ' }).ok, false);
  });

  test('specialty é TEXTO LIVRE opcional — o sistema não conhece "cabeleireiro/manicure"', () => {
    const r = validateNewProfessional({ name: 'Bia', specialty: 'micropigmentação' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.specialty, 'micropigmentação');
  });

  test('hrEmployeeId carimba um vínculo SOLTO opcional', () => {
    const r = validateNewProfessional({ name: 'Bia', hrEmployeeId: 'emp-42' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.hrEmployeeId, 'emp-42');

    const semVinculo = validateNewProfessional({ name: 'Bia' });
    assert.equal(semVinculo.ok, true);
    if (semVinculo.ok) assert.equal(semVinculo.value.hrEmployeeId, null);
  });

  test('nome longo demais é recusado', () => {
    assert.equal(validateNewProfessional({ name: 'x'.repeat(201) }).ok, false);
  });
});

describe('summarize', () => {
  test('conta o roster por estado sem inventar número', () => {
    const r = summarize([
      profissional({ status: 'active' }),
      profissional({ id: 'p2', status: 'active' }),
      profissional({ id: 'p3', status: 'archived' }),
    ]);
    assert.deepEqual(r, { total: 3, active: 2, archived: 1 });
  });
});
