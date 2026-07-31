import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewProject } from './proj.ts';

describe('validateNewProject — um projeto novo', () => {
  test('um projeto bom passa, nasce planning, com id vazio (o servidor carimba)', () => {
    const r = validateNewProject({ name: '  Implantação ERP  ', description: '  fase 1  ' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.name, 'Implantação ERP'); // trim
      assert.equal(r.value.description, 'fase 1');
      assert.equal(r.value.status, 'planning');
      assert.equal(r.value.id, '');
      assert.equal(r.value.completionNote, '');
      assert.equal(r.value.cancelReason, '');
    }
  });

  test('⭐ a descrição é OPCIONAL — sem descrição vira vazio, não erro', () => {
    const r = validateNewProject({ name: 'Projeto Solo' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.description, '');

    const branco = validateNewProject({ name: 'Projeto Solo', description: '   ' });
    assert.equal(branco.ok, true);
    if (branco.ok) assert.equal(branco.value.description, '');
  });

  test('sem nome: recusado, com o campo apontado', () => {
    for (const name of [undefined, null, '', '   ', 42]) {
      const r = validateNewProject({ name });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
    }
  });

  test('nome longo demais é recusado no campo name', () => {
    const r = validateNewProject({ name: 'x'.repeat(201) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });

  test('descrição longa demais é recusada no campo description', () => {
    const r = validateNewProject({ name: 'ok', description: 'y'.repeat(1001) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'description'));
  });
});
