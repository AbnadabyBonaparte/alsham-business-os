import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewSprint } from './scrum.ts';

describe('validateNewSprint — um sprint novo', () => {
  test('um sprint bom passa, nasce planned, com id vazio', () => {
    const r = validateNewSprint({
      projectId: '  p-123  ',
      projectName: '  Obra  ',
      name: '  Sprint 1  ',
      goal: '  entregar o MVP  ',
      startsOn: '2027-01-06',
      endsOn: '2027-01-20',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.projectId, 'p-123');
      assert.equal(r.value.name, 'Sprint 1');
      assert.equal(r.value.goal, 'entregar o MVP');
      assert.equal(r.value.status, 'planned');
      assert.equal(r.value.id, '');
      assert.equal(r.value.startsOn, '2027-01-06');
      assert.equal(r.value.endsOn, '2027-01-20');
    }
  });

  test('⭐ objetivo e datas são OPCIONAIS — ausentes viram vazio', () => {
    const r = validateNewSprint({ projectId: 'p', name: 'Sprint só' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.goal, '');
      assert.equal(r.value.startsOn, '');
      assert.equal(r.value.endsOn, '');
    }
  });

  test('sem projeto: recusado, com o campo apontado', () => {
    const r = validateNewSprint({ name: 'Sprint' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'projectId'));
  });

  test('sem nome: recusado', () => {
    for (const name of [undefined, null, '', '   ', 42]) {
      const r = validateNewSprint({ projectId: 'p', name });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
    }
  });

  test('data inválida (formato ou calendário) é recusada', () => {
    const r1 = validateNewSprint({ projectId: 'p', name: 'S', startsOn: '06/01/2027' });
    assert.equal(r1.ok, false);
    if (!r1.ok) assert.ok(r1.problems.some((p) => p.field === 'startsOn'));

    const r2 = validateNewSprint({ projectId: 'p', name: 'S', endsOn: '2027-02-30' });
    assert.equal(r2.ok, false);
    if (!r2.ok) assert.ok(r2.problems.some((p) => p.field === 'endsOn'));
  });

  test('⭐ janela invertida (fim antes do início) é recusada', () => {
    const r = validateNewSprint({
      projectId: 'p',
      name: 'S',
      startsOn: '2027-01-20',
      endsOn: '2027-01-06',
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'endsOn'));
  });
});
