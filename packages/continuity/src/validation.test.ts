import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewPlan, validateNewDrill, summarizePlans } from './continuity.ts';
import type { ContinuityPlan } from './types.ts';

const PLAN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function plano(over: Partial<ContinuityPlan> = {}): ContinuityPlan {
  return { id: 'p1', name: 'Plano', scope: '', rto: '', rpo: '', status: 'active', ...over };
}

describe('validateNewPlan — o cadastro de um plano de continuidade', () => {
  test('um plano bom passa, nasce ativo, com id vazio (o servidor carimba)', () => {
    const r = validateNewPlan({
      name: '  Continuidade TI  ',
      scope: '  Datacenter e ERP  ',
      rto: '  4 horas  ',
      rpo: '  última transação confirmada  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.name, 'Continuidade TI'); // trim
      assert.equal(r.value.scope, 'Datacenter e ERP');
      assert.equal(r.value.rto, '4 horas');
      assert.equal(r.value.rpo, 'última transação confirmada');
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ escopo/RTO/RPO são OPCIONAIS — ausentes viram vazio, não erro', () => {
    const soNome = validateNewPlan({ name: 'Plano Solo' });
    assert.equal(soNome.ok, true);
    if (soNome.ok) {
      assert.equal(soNome.value.scope, '');
      assert.equal(soNome.value.rto, '');
      assert.equal(soNome.value.rpo, '');
    }

    const brancos = validateNewPlan({ name: 'Plano Solo', scope: '  ', rto: '   ', rpo: '  ' });
    assert.equal(brancos.ok, true);
    if (brancos.ok) {
      assert.equal(brancos.value.scope, '');
      assert.equal(brancos.value.rto, '');
      assert.equal(brancos.value.rpo, '');
    }
  });

  test('sem nome: recusada, com o campo apontado', () => {
    for (const name of [undefined, null, '', '   ', 42]) {
      const r = validateNewPlan({ name });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
    }
  });

  test('nome longo demais é recusado no campo name', () => {
    const r = validateNewPlan({ name: 'x'.repeat(201) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });
});

describe('validateNewDrill — o registro de um drill (fato consumado)', () => {
  test('um drill bom passa, nasce com id vazio (o servidor carimba quem/quando)', () => {
    const r = validateNewDrill({
      planId: `  ${PLAN}  `,
      drilledOn: '2026-07-31',
      scenario: '  Queda do datacenter primário  ',
      outcome: '  RTO cumprido em 3h  ',
      note: '  sem perda de dados  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.planId, PLAN); // trim
      assert.equal(r.value.drilledOn, '2026-07-31');
      assert.equal(r.value.scenario, 'Queda do datacenter primário');
      assert.equal(r.value.outcome, 'RTO cumprido em 3h');
      assert.equal(r.value.note, 'sem perda de dados');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ a nota é OPCIONAL — sem observação vira vazio, não erro', () => {
    const r = validateNewDrill({
      planId: PLAN,
      drilledOn: '2026-07-31',
      scenario: 'Restore de backup',
      outcome: 'OK',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.note, '');
  });

  test('⭐ o plano (id solto) é OBRIGATÓRIO', () => {
    for (const planId of [undefined, null, '', '   ', 42]) {
      const r = validateNewDrill({ planId, drilledOn: '2026-07-31', scenario: 'x', outcome: 'y' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'planId'));
    }
  });

  test('o dia do drill é OBRIGATÓRIO', () => {
    for (const drilledOn of [undefined, null, '']) {
      const r = validateNewDrill({ planId: PLAN, drilledOn, scenario: 'x', outcome: 'y' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'drilledOn'));
    }
  });

  test('data inválida (formato ou calendário) é recusada', () => {
    for (const drilledOn of ['31/07/2026', '2026-7-1', 'ontem', '2026-02-30']) {
      const r = validateNewDrill({ planId: PLAN, drilledOn, scenario: 'x', outcome: 'y' });
      assert.equal(r.ok, false, `data=${drilledOn} deveria ser recusada`);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'drilledOn'));
    }
  });

  test('⭐ o cenário é OBRIGATÓRIO', () => {
    for (const scenario of [undefined, null, '', '   ', 42]) {
      const r = validateNewDrill({ planId: PLAN, drilledOn: '2026-07-31', scenario, outcome: 'y' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'scenario'));
    }
  });

  test('⭐ o desfecho é OBRIGATÓRIO', () => {
    for (const outcome of [undefined, null, '', '   ', 42]) {
      const r = validateNewDrill({ planId: PLAN, drilledOn: '2026-07-31', scenario: 'x', outcome });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'outcome'));
    }
  });
});

describe('summarizePlans — conta por estado (todo número é length, nunca chute)', () => {
  test('o resumo conta ativos e arquivados', () => {
    const lista = [
      plano({ status: 'active' }),
      plano({ status: 'active' }),
      plano({ status: 'archived' }),
    ];
    assert.deepEqual(summarizePlans(lista), { total: 3, active: 2, archived: 1 });
    assert.deepEqual(summarizePlans([]), { total: 0, active: 0, archived: 0 });
  });
});
