import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewMilestone } from './sched.ts';

const PROJ = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('validateNewMilestone — um marco novo', () => {
  test('um marco bom passa, nasce planned, com id vazio (o servidor carimba)', () => {
    const r = validateNewMilestone({
      projectId: PROJ,
      projectName: '  Implantação ERP  ',
      title: '  Kickoff  ',
      dueOn: '2027-03-01',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.projectId, PROJ);
      assert.equal(r.value.projectName, 'Implantação ERP'); // trim
      assert.equal(r.value.title, 'Kickoff'); // trim
      assert.equal(r.value.dueOn, '2027-03-01');
      assert.equal(r.value.status, 'planned');
      assert.equal(r.value.id, '');
      assert.equal(r.value.cancelReason, '');
    }
  });

  test('⭐ a data prevista é OPCIONAL — sem data vira null, não erro', () => {
    const semData = validateNewMilestone({ projectId: PROJ, title: 'Entrega' });
    assert.equal(semData.ok, true);
    if (semData.ok) assert.equal(semData.value.dueOn, null);

    const branco = validateNewMilestone({ projectId: PROJ, title: 'Entrega', dueOn: '   ' });
    assert.equal(branco.ok, true);
    if (branco.ok) assert.equal(branco.value.dueOn, null);

    const nulo = validateNewMilestone({ projectId: PROJ, title: 'Entrega', dueOn: null });
    assert.equal(nulo.ok, true);
    if (nulo.ok) assert.equal(nulo.value.dueOn, null);
  });

  test('data prevista em formato inválido é recusada no campo dueOn', () => {
    for (const dueOn of ['01/03/2027', '2027-3-1', 'amanhã', '2027-13-40']) {
      const r = validateNewMilestone({ projectId: PROJ, title: 'ok', dueOn });
      assert.equal(r.ok, false, `${String(dueOn)} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'dueOn'));
    }
  });

  test('sem projeto: recusado, com o campo apontado', () => {
    for (const projectId of [undefined, null, '', '   ', 42]) {
      const r = validateNewMilestone({ projectId, title: 'Kickoff' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'projectId'));
    }
  });

  test('sem título: recusado, com o campo apontado', () => {
    for (const title of [undefined, null, '', '   ', 42]) {
      const r = validateNewMilestone({ projectId: PROJ, title });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
    }
  });

  test('título longo demais é recusado no campo title', () => {
    const r = validateNewMilestone({ projectId: PROJ, title: 'x'.repeat(201) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
  });
});
