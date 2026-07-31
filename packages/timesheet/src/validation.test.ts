import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewEntry } from './timesheet.ts';

const PROJ = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('validateNewEntry — o registro de um apontamento de horas', () => {
  test('um apontamento bom passa, nasce com id vazio (o servidor carimba quem/quando)', () => {
    const r = validateNewEntry({
      projectId: `  ${PROJ}  `,
      projectName: '  Obra Central  ',
      collaboratorName: '  Ana Freelancer  ',
      collaboratorId: '  e-9  ',
      workedOn: '2026-07-31',
      hours: 8,
      description: '  fundação  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.projectId, PROJ); // trim
      assert.equal(r.value.projectName, 'Obra Central');
      assert.equal(r.value.collaboratorName, 'Ana Freelancer');
      assert.equal(r.value.collaboratorId, 'e-9');
      assert.equal(r.value.workedOn, '2026-07-31');
      assert.equal(r.value.hours, 8);
      assert.equal(r.value.description, 'fundação');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ o colaborador cadastrado e a descrição são OPCIONAIS — o executor pode ser terceiro', () => {
    const r = validateNewEntry({
      projectId: PROJ,
      collaboratorName: 'Terceiro sem cadastro',
      workedOn: '2026-07-31',
      hours: 4.5,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.collaboratorId, null);
      assert.equal(r.value.description, '');
      assert.equal(r.value.projectName, '');
      assert.equal(r.value.hours, 4.5);
    }
  });

  test('⭐ o projeto (id solto) é OBRIGATÓRIO', () => {
    for (const projectId of [undefined, null, '', '   ', 42]) {
      const r = validateNewEntry({ projectId, collaboratorName: 'Ana', workedOn: '2026-07-31', hours: 8 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'projectId'));
    }
  });

  test('⭐ quem trabalhou (nome) é OBRIGATÓRIO', () => {
    for (const collaboratorName of [undefined, null, '', '   ', 42]) {
      const r = validateNewEntry({ projectId: PROJ, collaboratorName, workedOn: '2026-07-31', hours: 8 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'collaboratorName'));
    }
  });

  test('⭐⭐ horas <= 0 são recusadas (zero é linha muda; negativo não é trabalho)', () => {
    for (const hours of [0, -1, -0.5, -999]) {
      const r = validateNewEntry({ projectId: PROJ, collaboratorName: 'Ana', workedOn: '2026-07-31', hours });
      assert.equal(r.ok, false, `hours=${hours} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'hours'));
    }
  });

  test('horas inválidas (não número, NaN, Infinity, ausente) são recusadas', () => {
    for (const hours of [undefined, 'muito', Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = validateNewEntry({ projectId: PROJ, collaboratorName: 'Ana', workedOn: '2026-07-31', hours });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'hours'));
    }
  });

  test('⭐ horas fracionárias positivas passam (não se exige inteiro)', () => {
    const r = validateNewEntry({ projectId: PROJ, collaboratorName: 'Ana', workedOn: '2026-07-31', hours: 7.75 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.hours, 7.75);
  });

  test('o dia trabalhado é OBRIGATÓRIO', () => {
    for (const workedOn of [undefined, null, '']) {
      const r = validateNewEntry({ projectId: PROJ, collaboratorName: 'Ana', workedOn, hours: 8 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'workedOn'));
    }
  });

  test('data inválida (formato ou calendário) é recusada', () => {
    for (const workedOn of ['31/07/2026', '2026-7-1', 'ontem', '2026-02-30']) {
      const r = validateNewEntry({ projectId: PROJ, collaboratorName: 'Ana', workedOn, hours: 8 });
      assert.equal(r.ok, false, `data=${workedOn} deveria ser recusada`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'workedOn'));
    }
  });

  test('nome de projeto / colaborador / descrição longos demais são recusados no campo certo', () => {
    const longoProj = validateNewEntry({
      projectId: PROJ, projectName: 'x'.repeat(201), collaboratorName: 'Ana', workedOn: '2026-07-31', hours: 8,
    });
    assert.equal(longoProj.ok, false);
    if (!longoProj.ok) assert.ok(longoProj.problems.some((p) => p.field === 'projectName'));

    const longoCol = validateNewEntry({
      projectId: PROJ, collaboratorName: 'y'.repeat(201), workedOn: '2026-07-31', hours: 8,
    });
    assert.equal(longoCol.ok, false);
    if (!longoCol.ok) assert.ok(longoCol.problems.some((p) => p.field === 'collaboratorName'));

    const longaDesc = validateNewEntry({
      projectId: PROJ, collaboratorName: 'Ana', workedOn: '2026-07-31', hours: 8, description: 'z'.repeat(1001),
    });
    assert.equal(longaDesc.ok, false);
    if (!longaDesc.ok) assert.ok(longaDesc.problems.some((p) => p.field === 'description'));
  });
});
