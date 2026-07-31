import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewAllocation } from './alloc.ts';

describe('validateNewAllocation — o cadastro de uma alocação', () => {
  test('uma alocação boa passa, nasce ativa, com id vazio (o servidor carimba)', () => {
    const r = validateNewAllocation({
      projectId: 'p-123',
      projectName: '  Obra Central  ',
      resourceName: '  Ana Freelancer  ',
      allocationPct: 40,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.projectId, 'p-123');
      assert.equal(r.value.projectName, 'Obra Central'); // trim
      assert.equal(r.value.resourceName, 'Ana Freelancer'); // trim
      assert.equal(r.value.allocationPct, 40);
      assert.equal(r.value.employeeId, null); // opcional
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ o colaborador é OPCIONAL — o recurso pode ser terceiro sem cadastro', () => {
    const semEmployee = validateNewAllocation({ projectId: 'p1', resourceName: 'Terceiro', allocationPct: 10 });
    assert.equal(semEmployee.ok, true);
    if (semEmployee.ok) assert.equal(semEmployee.value.employeeId, null);

    const comEmployee = validateNewAllocation({
      projectId: 'p1',
      resourceName: 'Colaborador',
      employeeId: 'e-9',
      allocationPct: 10,
    });
    assert.equal(comEmployee.ok, true);
    if (comEmployee.ok) assert.equal(comEmployee.value.employeeId, 'e-9');
  });

  test('sem projeto: recusada, com o campo apontado', () => {
    for (const projectId of [undefined, null, '', '   ', 42]) {
      const r = validateNewAllocation({ projectId, resourceName: 'R', allocationPct: 10 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'projectId'));
    }
  });

  test('sem recurso: recusada, com o campo apontado', () => {
    for (const resourceName of [undefined, null, '', '   ', 42]) {
      const r = validateNewAllocation({ projectId: 'p1', resourceName, allocationPct: 10 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'resourceName'));
    }
  });

  test('nome de recurso longo demais é recusado no campo resourceName', () => {
    const r = validateNewAllocation({ projectId: 'p1', resourceName: 'x'.repeat(201), allocationPct: 10 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'resourceName'));
  });

  test('⭐ o percentual é obrigatório e deve estar em (0, 100]', () => {
    // Ausente
    const ausente = validateNewAllocation({ projectId: 'p1', resourceName: 'R' });
    assert.equal(ausente.ok, false);
    if (!ausente.ok) assert.ok(ausente.problems.some((p) => p.field === 'allocationPct'));

    // Fora do intervalo (a régua da migration: pct=150 é recusado)
    for (const allocationPct of [0, -5, 100.01, 150]) {
      const r = validateNewAllocation({ projectId: 'p1', resourceName: 'R', allocationPct });
      assert.equal(r.ok, false, `pct=${allocationPct} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'allocationPct'));
    }

    // Não-número
    const naoNumero = validateNewAllocation({ projectId: 'p1', resourceName: 'R', allocationPct: 'muito' });
    assert.equal(naoNumero.ok, false);
    if (!naoNumero.ok) assert.ok(naoNumero.problems.some((p) => p.field === 'allocationPct'));

    // Limites válidos
    for (const allocationPct of [0.01, 50, 100]) {
      const r = validateNewAllocation({ projectId: 'p1', resourceName: 'R', allocationPct });
      assert.equal(r.ok, true, `pct=${allocationPct} deveria passar`);
    }
  });

  test('as datas são opcionais; se ambas presentes, o fim não vem antes do início', () => {
    const semDatas = validateNewAllocation({ projectId: 'p1', resourceName: 'R', allocationPct: 10 });
    assert.equal(semDatas.ok, true);
    if (semDatas.ok) {
      assert.equal(semDatas.value.startsOn, null);
      assert.equal(semDatas.value.endsOn, null);
    }

    const invertidas = validateNewAllocation({
      projectId: 'p1',
      resourceName: 'R',
      allocationPct: 10,
      startsOn: '2026-08-10',
      endsOn: '2026-08-01',
    });
    assert.equal(invertidas.ok, false);
    if (!invertidas.ok) assert.ok(invertidas.problems.some((p) => p.field === 'endsOn'));

    const ok = validateNewAllocation({
      projectId: 'p1',
      resourceName: 'R',
      allocationPct: 10,
      startsOn: '2026-08-01',
      endsOn: '2026-08-10',
    });
    assert.equal(ok.ok, true);
  });
});
