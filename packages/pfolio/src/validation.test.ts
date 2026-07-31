import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewPortfolio, validateNewMember } from './pfolio.ts';

describe('validateNewPortfolio — um portfólio novo', () => {
  test('um portfólio bom passa, nasce active, com id vazio', () => {
    const r = validateNewPortfolio({
      name: '  Estratégicos 2027  ',
      description: '  os projetos da diretoria  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.name, 'Estratégicos 2027');
      assert.equal(r.value.description, 'os projetos da diretoria');
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ a descrição é OPCIONAL — ausente vira vazio', () => {
    const r = validateNewPortfolio({ name: 'Só o nome' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.description, '');
  });

  test('sem nome: recusado, com o campo apontado', () => {
    for (const name of [undefined, null, '', '   ', 42]) {
      const r = validateNewPortfolio({ name });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
    }
  });
});

describe('validateNewMember — um projeto entra no portfólio', () => {
  test('um membro bom passa, com id vazio', () => {
    const r = validateNewMember({
      portfolioId: '  pf-1  ',
      projectId: '  pj-9  ',
      projectName: '  Obra Central  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.portfolioId, 'pf-1');
      assert.equal(r.value.projectId, 'pj-9');
      assert.equal(r.value.projectName, 'Obra Central');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ o nome do projeto é OPCIONAL (carimbado pela tela) — ausente vira vazio', () => {
    const r = validateNewMember({ portfolioId: 'pf', projectId: 'pj' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.projectName, '');
  });

  test('sem portfólio: recusado', () => {
    const r = validateNewMember({ projectId: 'pj' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'portfolioId'));
  });

  test('sem projeto: recusado', () => {
    const r = validateNewMember({ portfolioId: 'pf' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'projectId'));
  });
});
