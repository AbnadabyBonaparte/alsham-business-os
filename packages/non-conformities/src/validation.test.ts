import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewEntry, validateClosure } from './non-conformities.ts';

describe('validateNewEntry — uma não conformidade nova', () => {
  test('uma NC boa passa, nasce open, com id vazio e sem nota de verificação', () => {
    const r = validateNewEntry({
      origin: '  auditoria interna  ',
      description: '  parafuso fora de spec no lote 42  ',
      rootCause: '  ajuste de torque perdido  ',
      capaActionId: '  capa-9  ',
      previousEntryId: '  nc-7  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.origin, 'auditoria interna');
      assert.equal(r.value.description, 'parafuso fora de spec no lote 42');
      assert.equal(r.value.rootCause, 'ajuste de torque perdido');
      assert.equal(r.value.capaActionId, 'capa-9');
      assert.equal(r.value.previousEntryId, 'nc-7');
      assert.equal(r.value.status, 'open');
      assert.equal(r.value.verificationNote, '');
      assert.equal(r.value.id, '');
    }
  });

  test('⭐ causa raiz, vínculo ao capa e antecedente são OPCIONAIS', () => {
    const r = validateNewEntry({ origin: 'reclamação', description: 'entrega atrasada' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.rootCause, '');
      assert.equal(r.value.capaActionId, null);
      assert.equal(r.value.previousEntryId, null);
    }
  });

  test('sem origem: recusado, com o campo apontado', () => {
    for (const origin of [undefined, null, '', '   ', 42]) {
      const r = validateNewEntry({ origin, description: 'algo' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'origin'));
    }
  });

  test('sem descrição: recusado, com o campo apontado', () => {
    for (const description of [undefined, null, '', '   ', 42]) {
      const r = validateNewEntry({ origin: 'auditoria', description });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'description'));
    }
  });
});

describe('validateClosure — o fechamento exige a nota de verificação (o DIVERGE do occ)', () => {
  test('com a nota de verificação: passa, e a nota vem aparada', () => {
    const r = validateClosure({ verificationNote: '  conferido por João; torque OK  ' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.verificationNote, 'conferido por João; torque OK');
  });

  test('⭐⭐ sem a nota de verificação: RECUSADO — fechar sem verificar é arquivar sem conferir', () => {
    for (const verificationNote of [undefined, null, '', '   ', 42]) {
      const r = validateClosure({ verificationNote });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'verificationNote'));
    }
  });
});
