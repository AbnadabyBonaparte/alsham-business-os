import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  validateNewManifestation,
  redactReporter,
  requiresResponse,
  isManifestationType,
} from './ombuds.ts';
import { MANIFESTATION_TYPES, type Manifestation } from './types.ts';

function manifestacao(over: Partial<Manifestation> = {}): Manifestation {
  return {
    id: 'm1',
    protocol: 'OUV-2026-ABCD1234',
    manifestationType: 'complaint',
    subject: 'Buraco na via pública',
    description: 'relato do que aconteceu',
    isAnonymous: false,
    reporterId: 'u-123',
    status: 'received',
    response: '',
    ...over,
  };
}

describe('validateNewManifestation — uma manifestação nova', () => {
  test('uma manifestação boa passa, nasce received, com id/protocol/reporterId/response vazios', () => {
    const r = validateNewManifestation({
      manifestationType: 'complaint',
      subject: '  buraco na via  ',
      description: '  descrição detalhada do ocorrido  ',
      isAnonymous: false,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.manifestationType, 'complaint');
      assert.equal(r.value.subject, 'buraco na via');
      assert.equal(r.value.description, 'descrição detalhada do ocorrido');
      assert.equal(r.value.isAnonymous, false);
      assert.equal(r.value.status, 'received');
      assert.equal(r.value.id, '');
      assert.equal(r.value.protocol, '');
      assert.equal(r.value.reporterId, null);
      assert.equal(r.value.response, '');
    }
  });

  test('⭐ as cinco naturezas da Lei 13.460 são aceitas', () => {
    for (const tipo of MANIFESTATION_TYPES) {
      const r = validateNewManifestation({ manifestationType: tipo, subject: 'x', description: 'y' });
      assert.equal(r.ok, true, tipo);
      if (r.ok) assert.equal(r.value.manifestationType, tipo);
    }
  });

  test('⭐ natureza ausente ou fora do rol: recusada (física do método)', () => {
    for (const tipo of [undefined, null, '', 'outra', 42]) {
      const r = validateNewManifestation({ manifestationType: tipo, subject: 'x', description: 'y' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'manifestationType'));
    }
  });

  test('sem assunto: recusado, com o campo apontado', () => {
    for (const subject of [undefined, null, '', '   ', 42]) {
      const r = validateNewManifestation({ manifestationType: 'complaint', subject, description: 'y' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'subject'));
    }
  });

  test('sem descrição: recusado (manifestação sem relato não é manifestação)', () => {
    for (const description of [undefined, null, '', '   ', 42]) {
      const r = validateNewManifestation({ manifestationType: 'complaint', subject: 'x', description });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'description'));
    }
  });

  test('⭐ aceita anônima true', () => {
    const r = validateNewManifestation({ manifestationType: 'report', subject: 'x', description: 'y', isAnonymous: true });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.isAnonymous, true);
  });

  test('⭐ aceita anônima false (o padrão honesto quando ausente)', () => {
    const semFlag = validateNewManifestation({ manifestationType: 'suggestion', subject: 'x', description: 'y' });
    assert.equal(semFlag.ok, true);
    if (semFlag.ok) assert.equal(semFlag.value.isAnonymous, false);

    const flagFalse = validateNewManifestation({ manifestationType: 'suggestion', subject: 'x', description: 'y', isAnonymous: false });
    assert.equal(flagFalse.ok, true);
    if (flagFalse.ok) assert.equal(flagFalse.value.isAnonymous, false);
  });
});

describe('isManifestationType — o guarda das cinco naturezas', () => {
  test('aceita as cinco e recusa o resto', () => {
    for (const tipo of MANIFESTATION_TYPES) assert.equal(isManifestationType(tipo), true);
    for (const nao of ['', 'outra', 'COMPLAINT', 42, null, undefined]) {
      assert.equal(isManifestationType(nao), false);
    }
  });
});

describe('⭐⭐ redactReporter — o guarda de anonimato, puro', () => {
  test('anônima com cidadão informado: reporterId vai a null', () => {
    const bruta = manifestacao({ isAnonymous: true, reporterId: 'u-999' });
    const limpa = redactReporter(bruta);
    assert.equal(limpa.reporterId, null);
    assert.equal(limpa.isAnonymous, true);
  });

  test('anônima já sem cidadão: devolve a mesma (idempotente)', () => {
    const bruta = manifestacao({ isAnonymous: true, reporterId: null });
    assert.strictEqual(redactReporter(bruta), bruta);
  });

  test('NÃO-anônima: o cidadão é preservado', () => {
    const bruta = manifestacao({ isAnonymous: false, reporterId: 'u-123' });
    const limpa = redactReporter(bruta);
    assert.equal(limpa.reporterId, 'u-123');
  });
});

describe('⭐ requiresResponse — encerrar exige resposta', () => {
  test('true quando o destino é terminal (answered/dismissed)', () => {
    assert.equal(requiresResponse('under_review', 'answered'), true);
    assert.equal(requiresResponse('under_review', 'dismissed'), true);
    assert.equal(requiresResponse('received', 'dismissed'), true);
  });

  test('false quando o destino não é terminal', () => {
    assert.equal(requiresResponse('received', 'under_review'), false);
    assert.equal(requiresResponse('received', 'received'), false);
  });
});
