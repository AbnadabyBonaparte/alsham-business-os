import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewRound } from './sop.ts';

describe('validateNewRound — a abertura de uma rodada de consenso', () => {
  test('uma rodada boa passa, nasce draft, sem carimbo, com id vazio (o servidor carimba)', () => {
    const r = validateNewRound({
      period: '  Q1 2027  ',
      title: '  Consenso do trimestre  ',
      planId: '  11111111-1111-4111-8111-111111111111  ',
      planName: '  Plano de demanda Q1 2027  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.period, 'Q1 2027'); // trim
      assert.equal(r.value.title, 'Consenso do trimestre');
      assert.equal(r.value.planId, '11111111-1111-4111-8111-111111111111');
      assert.equal(r.value.planName, 'Plano de demanda Q1 2027');
      assert.equal(r.value.status, 'draft');
      assert.equal(r.value.cancelReason, '');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ título, plano e nome do plano são OPCIONAIS — sem eles vira vazio/null, não erro', () => {
    const r = validateNewRound({ period: 'Ciclo Março/2027' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.title, '');
      assert.equal(r.value.planId, null);
      assert.equal(r.value.planName, '');
    }
  });

  test('sem período: recusada, com o campo apontado', () => {
    for (const period of [undefined, null, '', '   ', 42]) {
      const r = validateNewRound({ period });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'period'));
    }
  });

  test('período longo demais é recusado no campo period', () => {
    const r = validateNewRound({ period: 'x'.repeat(121) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'period'));
  });

  test('título longo demais é recusado no campo title', () => {
    const r = validateNewRound({ period: 'Q1 2027', title: 'x'.repeat(201) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
  });

  test('nome do plano longo demais é recusado no campo planName', () => {
    const r = validateNewRound({ period: 'Q1 2027', planName: 'x'.repeat(201) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'planName'));
  });

  test('⭐ planId não-texto vira null — o vínculo é um id solto opcional', () => {
    for (const planId of [undefined, null, 42, {}]) {
      const r = validateNewRound({ period: 'Q1 2027', planId });
      assert.equal(r.ok, true);
      if (r.ok) assert.equal(r.value.planId, null);
    }
  });
});
