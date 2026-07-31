import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewControl, validateNewTest, summarizeControls } from './control.ts';
import type { InternalControl } from './types.ts';

function controle(over: Partial<InternalControl> = {}): InternalControl {
  return {
    id: 'c1',
    name: 'Dupla aprovação de notas altas',
    description: '',
    controlType: 'preventive',
    owner: '',
    frequency: '',
    eriskId: null,
    status: 'active',
    ...over,
  };
}

describe('validateNewControl — o cadastro de um controle interno', () => {
  test('um controle bom passa, nasce ativo, com id vazio (o servidor carimba)', () => {
    const r = validateNewControl({
      name: '  Contagem mensal de estoque  ',
      controlType: 'detective',
      owner: '  Financeiro  ',
      frequency: '  mensal  ',
      description: '  confere o físico contra o sistema  ',
      eriskId: '  r-9  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.name, 'Contagem mensal de estoque'); // trim
      assert.equal(r.value.controlType, 'detective');
      assert.equal(r.value.owner, 'Financeiro');
      assert.equal(r.value.frequency, 'mensal');
      assert.equal(r.value.description, 'confere o físico contra o sistema');
      assert.equal(r.value.eriskId, 'r-9');
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ dono, frequência, descrição e vínculo ao risco são OPCIONAIS', () => {
    const r = validateNewControl({ name: 'Controle solo', controlType: 'corrective' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.owner, '');
      assert.equal(r.value.frequency, '');
      assert.equal(r.value.description, '');
      assert.equal(r.value.eriskId, null);
    }
  });

  test('sem nome: recusada, com o campo apontado', () => {
    for (const name of [undefined, null, '', '   ', 42]) {
      const r = validateNewControl({ name, controlType: 'preventive' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
    }
  });

  test('⭐ o tipo é obrigatório e tem de ser um dos três do COSO', () => {
    for (const controlType of [undefined, null, '', 'directive', 'other', 42]) {
      const r = validateNewControl({ name: 'ok', controlType });
      assert.equal(r.ok, false, `controlType=${String(controlType)} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'controlType'));
    }
    for (const controlType of ['preventive', 'detective', 'corrective']) {
      const r = validateNewControl({ name: 'ok', controlType });
      assert.equal(r.ok, true, `controlType=${controlType} deveria passar`);
    }
  });

  test('nome longo demais é recusado no campo name', () => {
    const r = validateNewControl({ name: 'x'.repeat(201), controlType: 'preventive' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });
});

describe('validateNewTest — o registro de um teste do controle', () => {
  test('um teste bom passa, nasce com id vazio (o servidor carimba quem/quando)', () => {
    const r = validateNewTest({
      controlId: '  c-1  ',
      testedOn: '2026-07-31',
      result: 'pass',
      note: '  sem exceções  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.controlId, 'c-1'); // trim
      assert.equal(r.value.testedOn, '2026-07-31');
      assert.equal(r.value.result, 'pass');
      assert.equal(r.value.note, 'sem exceções');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ a nota é OPCIONAL — sem nota vira vazio, não erro', () => {
    const r = validateNewTest({ controlId: 'c-1', testedOn: '2026-07-31', result: 'fail' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.note, '');
  });

  test('⭐ o controle (id solto) é OBRIGATÓRIO', () => {
    for (const controlId of [undefined, null, '', '   ', 42]) {
      const r = validateNewTest({ controlId, testedOn: '2026-07-31', result: 'pass' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'controlId'));
    }
  });

  test('o dia do teste é OBRIGATÓRIO e ISO real', () => {
    for (const testedOn of [undefined, null, '']) {
      const r = validateNewTest({ controlId: 'c-1', testedOn, result: 'pass' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'testedOn'));
    }
    for (const testedOn of ['31/07/2026', '2026-7-1', 'ontem', '2026-02-30']) {
      const r = validateNewTest({ controlId: 'c-1', testedOn, result: 'pass' });
      assert.equal(r.ok, false, `data=${testedOn} deveria ser recusada`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'testedOn'));
    }
  });

  test('⭐ o resultado tem de ser pass ou fail (CHECK do banco)', () => {
    for (const result of [undefined, null, '', 'passed', 'ok', 42]) {
      const r = validateNewTest({ controlId: 'c-1', testedOn: '2026-07-31', result });
      assert.equal(r.ok, false, `result=${String(result)} deveria ser recusado`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'result'));
    }
    for (const result of ['pass', 'fail']) {
      const r = validateNewTest({ controlId: 'c-1', testedOn: '2026-07-31', result });
      assert.equal(r.ok, true, `result=${result} deveria passar`);
    }
  });
});

describe('summarizeControls — a leitura contável do cadastro', () => {
  test('conta por estado — todo número é length, nunca chute', () => {
    const lista = [
      controle({ status: 'active' }),
      controle({ status: 'active' }),
      controle({ status: 'archived' }),
    ];
    assert.deepEqual(summarizeControls(lista), { total: 3, active: 2, archived: 1 });
    assert.deepEqual(summarizeControls([]), { total: 0, active: 0, archived: 0 });
  });
});
