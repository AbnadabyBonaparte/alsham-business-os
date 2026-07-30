import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeGoals, validateNewGoal } from './goals.ts';
import type { Goal } from './types.ts';

function meta(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g1',
    title: 'Meta',
    description: '',
    metric: 'faturamento',
    targetValue: null,
    currency: null,
    startsOn: '2026-07-01',
    endsOn: '2026-09-30',
    assigneeUserId: null,
    status: 'active',
    decidedAt: null,
    cancelReason: '',
    ...over,
  };
}

describe('validateNewGoal', () => {
  test('o mínimo honesto: título, métrica e período — nasce no rascunho', () => {
    const r = validateNewGoal({
      title: 'Ocupação do prédio',
      metric: 'lojas ocupadas',
      startsOn: '2026-08-01',
      endsOn: '2026-12-31',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'draft');
      assert.equal(r.value.targetValue, null);
    }
  });

  test('⛔ meta sem métrica não é alvo, é desejo', () => {
    const r = validateNewGoal({ title: 'X', startsOn: '2026-08-01', endsOn: '2026-08-31' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.problems[0]!.message, /desejo/);
  });

  test('⭐ o alvo é opcional — mas moeda declarada exige o valor', () => {
    const soMoeda = validateNewGoal({
      title: 'X',
      metric: 'faturamento',
      currency: 'BRL',
      startsOn: '2026-08-01',
      endsOn: '2026-08-31',
    });
    assert.equal(soMoeda.ok, false);
    if (!soMoeda.ok) assert.match(soMoeda.problems[0]!.message, /promessa/);

    const juntos = validateNewGoal({
      title: 'X',
      metric: 'faturamento',
      targetValue: 300000,
      currency: 'brl',
      startsOn: '2026-08-01',
      endsOn: '2026-08-31',
    });
    assert.equal(juntos.ok, true);
    if (juntos.ok) assert.equal(juntos.value.currency, 'BRL');
  });

  test('período invertido é recusado; meta de um dia vale', () => {
    const invertido = validateNewGoal({
      title: 'X', metric: 'y', startsOn: '2026-09-01', endsOn: '2026-08-01',
    });
    assert.equal(invertido.ok, false);

    const umDia = validateNewGoal({
      title: 'X', metric: 'y', startsOn: '2026-08-01', endsOn: '2026-08-01',
    });
    assert.equal(umDia.ok, true);
  });
});

describe('summarizeGoals', () => {
  test('conta o placar sem inventar número', () => {
    const r = summarizeGoals([
      meta(),
      meta({ id: 'g2', status: 'draft' }),
      meta({ id: 'g3', status: 'achieved', decidedAt: 'x' }),
      meta({ id: 'g4', status: 'missed', decidedAt: 'x' }),
      meta({ id: 'g5', status: 'cancelled', decidedAt: 'x', cancelReason: 'y' }),
    ]);
    assert.deepEqual(r, { total: 5, active: 1, draft: 1, achieved: 1, missed: 1 });
  });
});
