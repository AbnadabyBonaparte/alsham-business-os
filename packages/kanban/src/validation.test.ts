import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewStage, validateNewCard } from './kanban.ts';

describe('validateNewStage — uma coluna nova', () => {
  test('uma coluna boa passa, com trim, id vazio (o servidor carimba)', () => {
    const r = validateNewStage({ projectId: 'p1', projectName: '  Obra  ', name: '  A Fazer  ', position: 0 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.name, 'A Fazer');
      assert.equal(r.value.projectName, 'Obra');
      assert.equal(r.value.projectId, 'p1');
      assert.equal(r.value.position, 0);
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ a coluna pertence a um projeto: sem projectId é recusada', () => {
    for (const projectId of [undefined, null, '', '   ', 42]) {
      const r = validateNewStage({ projectId, name: 'A Fazer', position: 0 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'projectId'));
    }
  });

  test('sem nome: recusada, com o campo apontado', () => {
    const r = validateNewStage({ projectId: 'p1', name: '   ', position: 0 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });

  test('position deve ser inteiro >= 0', () => {
    for (const position of [-1, 1.5, 'x', undefined, null]) {
      const r = validateNewStage({ projectId: 'p1', name: 'A Fazer', position });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'position'));
    }
    const ok = validateNewStage({ projectId: 'p1', name: 'A Fazer', position: 3 });
    assert.equal(ok.ok, true);
  });

  test('nome longo demais é recusado no campo name', () => {
    const r = validateNewStage({ projectId: 'p1', name: 'x'.repeat(201), position: 0 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });
});

describe('validateNewCard — um cartão novo', () => {
  test('um cartão bom passa, com trim, id vazio', () => {
    const r = validateNewCard({ projectId: 'p1', projectName: 'Obra', stageId: 's1', title: '  Comprar cimento  ', description: '  50 sacos  ' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.title, 'Comprar cimento');
      assert.equal(r.value.description, '50 sacos');
      assert.equal(r.value.projectId, 'p1');
      assert.equal(r.value.stageId, 's1');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ o cartão pertence a um projeto: sem projectId é recusado (o escopo)', () => {
    for (const projectId of [undefined, null, '', '   ']) {
      const r = validateNewCard({ projectId, stageId: 's1', title: 'T' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'projectId'));
    }
  });

  test('o cartão nasce numa coluna: sem stageId é recusado', () => {
    const r = validateNewCard({ projectId: 'p1', title: 'T' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'stageId'));
  });

  test('sem título: recusado', () => {
    const r = validateNewCard({ projectId: 'p1', stageId: 's1', title: '   ' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
  });

  test('⭐ a descrição é OPCIONAL — sem descrição vira vazio, não erro', () => {
    const r = validateNewCard({ projectId: 'p1', stageId: 's1', title: 'T' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.description, '');
  });

  test('título longo demais é recusado', () => {
    const r = validateNewCard({ projectId: 'p1', stageId: 's1', title: 'x'.repeat(201) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
  });
});
