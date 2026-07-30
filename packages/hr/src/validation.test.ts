import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeRoster, validateNewEmployee } from './hr.ts';
import type { Employee } from './types.ts';

function colaborador(over: Partial<Employee> = {}): Employee {
  return {
    id: 'e1',
    fullName: 'Ana Vendedora',
    roleTitle: 'Vendedora',
    department: '',
    hiredOn: '2026-01-06',
    status: 'active',
    terminationReason: '',
    previousEmployeeId: null,
    ...over,
  };
}

describe('validateNewEmployee', () => {
  test('o mínimo honesto: nome, cargo e data de admissão', () => {
    const r = validateNewEmployee({ fullName: 'Ana', roleTitle: 'Vendedora', hiredOn: '2026-01-06' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.status, 'active');
  });

  test('⛔ sem nome, sem cargo ou sem data não cadastra', () => {
    assert.equal(validateNewEmployee({ roleTitle: 'X', hiredOn: '2026-01-06' }).ok, false);
    assert.equal(validateNewEmployee({ fullName: 'Ana', hiredOn: '2026-01-06' }).ok, false);
    assert.equal(validateNewEmployee({ fullName: 'Ana', roleTitle: 'X' }).ok, false);
  });

  test('departamento é opcional; vínculo anterior (id solto) é opcional', () => {
    const r = validateNewEmployee({ fullName: 'Ana', roleTitle: 'X', hiredOn: '2026-01-06' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.department, '');
      assert.equal(r.value.previousEmployeeId, null);
    }
    const rv = validateNewEmployee({ fullName: 'Ana', roleTitle: 'X', hiredOn: '2026-01-06', previousEmployeeId: 'prev-1' });
    assert.equal(rv.ok, true);
    if (rv.ok) assert.equal(rv.value.previousEmployeeId, 'prev-1');
  });

  test('nasce sempre ativo, sem carimbo de desligamento', () => {
    const r = validateNewEmployee({ fullName: 'Ana', roleTitle: 'X', hiredOn: '2026-01-06' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.terminationReason, '');
  });
});

describe('summarizeRoster', () => {
  test('conta o roster por estado sem inventar número', () => {
    const r = summarizeRoster([
      colaborador({ status: 'active' }),
      colaborador({ id: 'e2', status: 'on_leave' }),
      colaborador({ id: 'e3', status: 'terminated', terminationReason: 'saiu' }),
      colaborador({ id: 'e4', status: 'active' }),
    ]);
    assert.deepEqual(r, { total: 4, active: 2, onLeave: 1, terminated: 1 });
  });
});
