import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewRisk, severity } from './erisk.ts';

describe('validateNewRisk — um risco corporativo novo', () => {
  test('um risco bom passa, nasce open, com id vazio', () => {
    const r = validateNewRisk({
      description: '  concorrente pode nos tirar o mercado  ',
      category: '  estratégico  ',
      owner: '  Diretoria  ',
      probability: 4,
      impact: 5,
      treatment: 'mitigate',
      treatmentPlan: '  diversificar portfólio  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.description, 'concorrente pode nos tirar o mercado');
      assert.equal(r.value.category, 'estratégico');
      assert.equal(r.value.owner, 'Diretoria');
      assert.equal(r.value.probability, 4);
      assert.equal(r.value.impact, 5);
      assert.equal(r.value.treatment, 'mitigate');
      assert.equal(r.value.treatmentPlan, 'diversificar portfólio');
      assert.equal(r.value.status, 'open');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ categoria, dono, tratamento e plano são OPCIONAIS — ausentes viram vazio/null', () => {
    const r = validateNewRisk({ description: 'risco', probability: 1, impact: 1 });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.category, '');
      assert.equal(r.value.owner, '');
      assert.equal(r.value.ownerId, null);
      assert.equal(r.value.treatment, null);
      assert.equal(r.value.treatmentPlan, '');
      assert.equal(r.value.controlId, null);
    }
  });

  test('sem descrição: recusado (risco sem descrição não é risco)', () => {
    for (const description of [undefined, null, '', '   ', 42]) {
      const r = validateNewRisk({ description, probability: 2, impact: 2 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'description'));
    }
  });

  test('⭐ a régua 1–5: o limite inferior rejeita 0', () => {
    const r = validateNewRisk({ description: 'x', probability: 0, impact: 3 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'probability'));
  });

  test('⭐ a régua 1–5: o limite superior rejeita 6', () => {
    const r = validateNewRisk({ description: 'x', probability: 3, impact: 6 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'impact'));
  });

  test('⭐ a régua 1–5 aceita as pontas 1 e 5', () => {
    const r = validateNewRisk({ description: 'x', probability: 1, impact: 5 });
    assert.equal(r.ok, true);
  });

  test('⭐ a régua 1–5 rejeita não-inteiro (2.5) e string ("3")', () => {
    const frac = validateNewRisk({ description: 'x', probability: 2.5, impact: 3 });
    assert.equal(frac.ok, false);
    if (!frac.ok) assert.ok(frac.problems.some((p) => p.field === 'probability'));

    const str = validateNewRisk({ description: 'x', probability: '3', impact: 3 });
    assert.equal(str.ok, false);
    if (!str.ok) assert.ok(str.problems.some((p) => p.field === 'probability'));
  });

  test('probabilidade E impacto ausentes: os dois campos são apontados', () => {
    const r = validateNewRisk({ description: 'x' });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.problems.some((p) => p.field === 'probability'));
      assert.ok(r.problems.some((p) => p.field === 'impact'));
    }
  });

  test('⭐ tratamento inválido é recusado; os 4 Ts passam', () => {
    const mau = validateNewRisk({ description: 'x', probability: 2, impact: 2, treatment: 'ignore' });
    assert.equal(mau.ok, false);
    if (!mau.ok) assert.ok(mau.problems.some((p) => p.field === 'treatment'));

    for (const t of ['accept', 'mitigate', 'transfer', 'avoid'] as const) {
      const r = validateNewRisk({ description: 'x', probability: 2, impact: 2, treatment: t });
      assert.equal(r.ok, true, `tratamento ${t} deveria passar`);
      if (r.ok) assert.equal(r.value.treatment, t);
    }
  });

  test('⭐ severity é probabilidade × impacto (leitura, a matriz — nunca decisão)', () => {
    assert.equal(severity({ probability: 1, impact: 1 }), 1);
    assert.equal(severity({ probability: 3, impact: 4 }), 12);
    assert.equal(severity({ probability: 5, impact: 5 }), 25);
  });
});
