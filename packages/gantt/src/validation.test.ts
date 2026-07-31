import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewDependency, wouldCycle, DEPENDENCY_TYPES } from './gantt.ts';
import type { DependencyEdge } from './types.ts';

describe('validateNewDependency — uma dependência nova', () => {
  test('uma aresta boa passa, nasce com id vazio e tipo default', () => {
    const r = validateNewDependency({
      predecessorId: '  m-A  ',
      predecessorName: '  Fundação  ',
      successorId: '  m-B  ',
      successorName: '  Alvenaria  ',
      projectId: '  p-1  ',
      projectName: '  Obra  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.predecessorId, 'm-A');
      assert.equal(r.value.successorId, 'm-B');
      assert.equal(r.value.predecessorName, 'Fundação');
      assert.equal(r.value.successorName, 'Alvenaria');
      assert.equal(r.value.projectId, 'p-1');
      assert.equal(r.value.dependencyType, 'finish_to_start');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ nomes e projeto são OPCIONAIS — ausentes viram vazio', () => {
    const r = validateNewDependency({ predecessorId: 'a', successorId: 'b' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.predecessorName, '');
      assert.equal(r.value.successorName, '');
      assert.equal(r.value.projectId, '');
      assert.equal(r.value.projectName, '');
    }
  });

  test('sem predecessor: recusado, com o campo apontado', () => {
    const r = validateNewDependency({ successorId: 'b' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'predecessorId'));
  });

  test('sem sucessor: recusado', () => {
    for (const successorId of [undefined, null, '', '   ', 42]) {
      const r = validateNewDependency({ predecessorId: 'a', successorId });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'successorId'));
    }
  });

  test('⭐ a aresta laço (predecessor = sucessor) é recusada', () => {
    const r = validateNewDependency({ predecessorId: 'x', successorId: 'x' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'successorId'));
  });

  test('⭐ cada um dos quatro tipos é aceito', () => {
    for (const t of DEPENDENCY_TYPES) {
      const r = validateNewDependency({ predecessorId: 'a', successorId: 'b', dependencyType: t });
      assert.equal(r.ok, true, `tipo ${t}`);
      if (r.ok) assert.equal(r.value.dependencyType, t);
    }
  });

  test('tipo fora do conjunto é recusado', () => {
    const r = validateNewDependency({ predecessorId: 'a', successorId: 'b', dependencyType: 'depende_de' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'dependencyType'));
  });

  test('tipo vazio/nulo cai no default finish_to_start', () => {
    for (const dependencyType of [undefined, null, '']) {
      const r = validateNewDependency({ predecessorId: 'a', successorId: 'b', dependencyType });
      assert.equal(r.ok, true);
      if (r.ok) assert.equal(r.value.dependencyType, 'finish_to_start');
    }
  });
});

describe('⭐ wouldCycle — a detecção de ciclo da camada de apresentação', () => {
  const edges: DependencyEdge[] = [
    { predecessorId: 'A', successorId: 'B' },
    { predecessorId: 'B', successorId: 'C' },
  ];

  test('a aresta laço é ciclo trivial', () => {
    assert.equal(wouldCycle([], 'A', 'A'), true);
  });

  test('⭐ fechar o ciclo é detectado: A→B→C já existe, C→A fecharia', () => {
    assert.equal(wouldCycle(edges, 'C', 'A'), true);
  });

  test('⭐ o atalho C→? que fecha via caminho existente também pega', () => {
    // B→C existe; C→B fecharia (B→C→B).
    assert.equal(wouldCycle(edges, 'C', 'B'), true);
  });

  test('uma aresta nova sem retorno NÃO é ciclo', () => {
    // A→B→C; adicionar A→C (atalho) não cria ciclo.
    assert.equal(wouldCycle(edges, 'A', 'C'), false);
    // um marco novo D pendurado no fim.
    assert.equal(wouldCycle(edges, 'C', 'D'), false);
  });

  test('grafo vazio: nenhuma aresta entre marcos distintos é ciclo', () => {
    assert.equal(wouldCycle([], 'A', 'B'), false);
  });
});
