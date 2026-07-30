import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewLine } from './dre.ts';

describe('a validação da linha nova', () => {
  const boa = { name: 'Vendas', kind: 'revenue', matchCategory: 'Vendas', position: 0, currency: 'BRL' };

  test('linha boa passa', () => {
    const r = validateNewLine(boa);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.kind, 'revenue');
  });

  test('nome vazio é recusado', () => {
    const r = validateNewLine({ ...boa, name: ' ' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });

  test('⭐ natureza fora de receita/custo/despesa é recusada', () => {
    const r = validateNewLine({ ...boa, kind: 'other' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'kind'));
  });

  test('⭐ categoria de casamento vazia é recusada — é a chave dos livros', () => {
    const r = validateNewLine({ ...boa, matchCategory: '' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'matchCategory'));
  });

  test('posição negativa é recusada', () => {
    const r = validateNewLine({ ...boa, position: -1 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'position'));
  });

  test('moeda não-ISO é recusada', () => {
    const r = validateNewLine({ ...boa, currency: 'reais' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'currency'));
  });

  test('posição ausente vira 0', () => {
    const { position, ...semPos } = boa;
    void position;
    const r = validateNewLine(semPos);
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.position, 0);
  });
});
