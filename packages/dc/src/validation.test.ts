import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewCenter } from './dc.ts';

describe('validateNewCenter — o cadastro de um centro de distribuição', () => {
  test('um CD bom passa, nasce ativo, com id vazio (o servidor carimba)', () => {
    const r = validateNewCenter({ name: '  CD Bonaparte  ', address: '  Rod. BR-101, km 20  ' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.name, 'CD Bonaparte'); // trim
      assert.equal(r.value.address, 'Rod. BR-101, km 20');
      assert.equal(r.value.status, 'active');
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
    }
  });

  test('⭐ o endereço é OPCIONAL — sem endereço vira vazio, não erro', () => {
    const semEndereco = validateNewCenter({ name: 'CD Solo' });
    assert.equal(semEndereco.ok, true);
    if (semEndereco.ok) assert.equal(semEndereco.value.address, '');

    const enderecoBranco = validateNewCenter({ name: 'CD Solo', address: '   ' });
    assert.equal(enderecoBranco.ok, true);
    if (enderecoBranco.ok) assert.equal(enderecoBranco.value.address, '');
  });

  test('sem nome: recusada, com o campo apontado', () => {
    for (const name of [undefined, null, '', '   ', 42]) {
      const r = validateNewCenter({ name });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
    }
  });

  test('nome longo demais é recusado no campo name', () => {
    const r = validateNewCenter({ name: 'x'.repeat(201) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });

  test('endereço longo demais é recusado no campo address', () => {
    const r = validateNewCenter({ name: 'ok', address: 'y'.repeat(301) });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'address'));
  });
});
