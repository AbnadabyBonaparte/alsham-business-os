import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewRisk } from './risk.ts';

describe('validateNewRisk — um risco novo', () => {
  test('um risco bom passa, nasce open, com id e createdAt vazios', () => {
    const r = validateNewRisk({
      projectId: '  p-123  ',
      projectName: '  Obra  ',
      description: '  fornecedor único de insumo crítico  ',
      probability: 4,
      impact: 5,
      mitigationPlan: '  homologar segundo fornecedor  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.projectId, 'p-123');
      assert.equal(r.value.description, 'fornecedor único de insumo crítico');
      assert.equal(r.value.probability, 4);
      assert.equal(r.value.impact, 5);
      assert.equal(r.value.mitigationPlan, 'homologar segundo fornecedor');
      assert.equal(r.value.status, 'open');
      assert.equal(r.value.id, '');
      assert.equal(r.value.createdAt, '');
    }
  });

  test('⭐ o plano de mitigação é OPCIONAL — ausente vira vazio', () => {
    const r = validateNewRisk({ projectId: 'p', description: 'risco', probability: 1, impact: 1 });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.mitigationPlan, '');
  });

  test('sem projeto: recusado, com o campo apontado', () => {
    const r = validateNewRisk({ description: 'risco', probability: 2, impact: 2 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'projectId'));
  });

  test('sem descrição: recusado (risco sem descrição não é risco)', () => {
    for (const description of [undefined, null, '', '   ', 42]) {
      const r = validateNewRisk({ projectId: 'p', description, probability: 2, impact: 2 });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'description'));
    }
  });

  test('⭐ a régua 1–5: o limite inferior rejeita 0', () => {
    const r = validateNewRisk({ projectId: 'p', description: 'x', probability: 0, impact: 3 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'probability'));
  });

  test('⭐ a régua 1–5: o limite superior rejeita 6', () => {
    const r = validateNewRisk({ projectId: 'p', description: 'x', probability: 3, impact: 6 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'impact'));
  });

  test('⭐ a régua 1–5 aceita as pontas 1 e 5', () => {
    const r = validateNewRisk({ projectId: 'p', description: 'x', probability: 1, impact: 5 });
    assert.equal(r.ok, true);
  });

  test('⭐ a régua 1–5 rejeita não-inteiro (2.5) e string ("3")', () => {
    const frac = validateNewRisk({ projectId: 'p', description: 'x', probability: 2.5, impact: 3 });
    assert.equal(frac.ok, false);
    if (!frac.ok) assert.ok(frac.problems.some((p) => p.field === 'probability'));

    const str = validateNewRisk({ projectId: 'p', description: 'x', probability: '3', impact: 3 });
    assert.equal(str.ok, false);
    if (!str.ok) assert.ok(str.problems.some((p) => p.field === 'probability'));
  });

  test('probabilidade E impacto ausentes: os dois campos são apontados', () => {
    const r = validateNewRisk({ projectId: 'p', description: 'x' });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.ok(r.problems.some((p) => p.field === 'probability'));
      assert.ok(r.problems.some((p) => p.field === 'impact'));
    }
  });
});
