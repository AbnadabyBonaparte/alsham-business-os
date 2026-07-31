import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewStage, validateNewIdea } from './idea.ts';

const STAGE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('validateNewStage — uma etapa do funil', () => {
  test('uma etapa boa passa, nasce com id vazio', () => {
    const r = validateNewStage({ name: '  Triagem  ', position: 2 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.name, 'Triagem');
      assert.equal(r.value.position, 2);
      assert.equal(r.value.id, '');
    }
  });

  test('nome vazio é recusado', () => {
    for (const name of [undefined, null, '', '   ', 42]) {
      const r = validateNewStage({ name, position: 0 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
    }
  });

  test('posição não-inteira ou negativa é recusada', () => {
    for (const position of [-1, 1.5, 'x', undefined, Number.NaN]) {
      const r = validateNewStage({ name: 'Etapa', position });
      assert.equal(r.ok, false, `position=${String(position)} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'position'));
    }
  });
});

describe('validateNewIdea — uma ideia nova', () => {
  test('uma ideia boa passa, nasce ATIVA, sem projeto de destino', () => {
    const r = validateNewIdea({
      title: '  Motor solar modular  ',
      description: '  esboço  ',
      currentStageId: `  ${STAGE}  `,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.title, 'Motor solar modular');
      assert.equal(r.value.description, 'esboço');
      assert.equal(r.value.currentStageId, STAGE); // trim
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.promotedProjectId, null); // ⭐ nasce sem projeto
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ a descrição é OPCIONAL', () => {
    const r = validateNewIdea({ title: 'Ideia enxuta', currentStageId: STAGE });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.description, '');
  });

  test('⭐ o título é OBRIGATÓRIO', () => {
    for (const title of [undefined, null, '', '   ', 42]) {
      const r = validateNewIdea({ title, currentStageId: STAGE });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
    }
  });

  test('⭐ a etapa inicial (id solto intra-schema) é OBRIGATÓRIA', () => {
    for (const currentStageId of [undefined, null, '', '   ']) {
      const r = validateNewIdea({ title: 'Ideia', currentStageId });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'currentStageId'));
    }
  });

  test('título / descrição longos demais são recusados no campo certo', () => {
    const longoT = validateNewIdea({ title: 'x'.repeat(201), currentStageId: STAGE });
    assert.equal(longoT.ok, false);
    if (!longoT.ok) assert.ok(longoT.problems.some((p) => p.field === 'title'));

    const longaD = validateNewIdea({ title: 'Ideia', currentStageId: STAGE, description: 'z'.repeat(2001) });
    assert.equal(longaD.ok, false);
    if (!longaD.ok) assert.ok(longaD.problems.some((p) => p.field === 'description'));
  });
});
