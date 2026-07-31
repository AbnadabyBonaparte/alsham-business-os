import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewRequirement, validateAssessment } from './iso.ts';

describe('validateNewRequirement — um requisito novo', () => {
  test('um requisito bom passa, nasce active, com id vazio', () => {
    const r = validateNewRequirement({
      clauseReference: '  ISO 9001:2015 — 8.5.1  ',
      description: '  Controle da produção e da prestação de serviço  ',
      compliance: 'compliant',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.clauseReference, 'ISO 9001:2015 — 8.5.1');
      assert.equal(r.value.description, 'Controle da produção e da prestação de serviço');
      assert.equal(r.value.compliance, 'compliant');
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.id, '');
    }
  });

  test('os três valores de conformidade são aceitos no registro', () => {
    for (const compliance of ['compliant', 'non_compliant', 'not_applicable']) {
      const r = validateNewRequirement({ clauseReference: 'ISO 14001 — 6.1.2', description: 'x', compliance });
      assert.equal(r.ok, true, `${compliance} deveria passar`);
    }
  });

  test('sem referência de cláusula: recusado, com o campo apontado', () => {
    for (const clauseReference of [undefined, null, '', '   ', 42]) {
      const r = validateNewRequirement({ clauseReference, description: 'x', compliance: 'compliant' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'clauseReference'));
    }
  });

  test('sem descrição: recusado, com o campo apontado', () => {
    for (const description of [undefined, null, '', '   ', 42]) {
      const r = validateNewRequirement({ clauseReference: 'ISO 9001 — 4.1', description, compliance: 'compliant' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'description'));
    }
  });

  test('⭐⭐ conformidade AUSENTE: recusado — sem default inventado (Lei 7)', () => {
    for (const compliance of [undefined, null]) {
      const r = validateNewRequirement({ clauseReference: 'ISO 9001 — 4.1', description: 'x', compliance });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'compliance'));
    }
  });

  test('⭐ conformidade INVÁLIDA (ex.: "unknown"): recusado', () => {
    for (const compliance of ['unknown', 'yes', 'sim', 7, {}]) {
      const r = validateNewRequirement({ clauseReference: 'ISO 9001 — 4.1', description: 'x', compliance });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'compliance'));
    }
  });
});

describe('validateAssessment — uma reavaliação', () => {
  test('cada valor válido passa e devolve a conformidade', () => {
    for (const compliance of ['compliant', 'non_compliant', 'not_applicable']) {
      const r = validateAssessment({ compliance });
      assert.equal(r.ok, true, `${compliance} deveria passar`);
      if (r.ok) assert.equal(r.value.compliance, compliance);
    }
  });

  test('⭐⭐ conformidade AUSENTE: recusado — nada de default (Lei 7)', () => {
    for (const compliance of [undefined, null]) {
      const r = validateAssessment({ compliance });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'compliance'));
    }
  });

  test('⭐ conformidade INVÁLIDA (ex.: "unknown"): recusado', () => {
    for (const compliance of ['unknown', 'compliantish', 3]) {
      const r = validateAssessment({ compliance });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'compliance'));
    }
  });
});
