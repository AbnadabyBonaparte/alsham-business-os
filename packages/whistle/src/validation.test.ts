import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { validateNewReport, redactReporter, requiresResolution } from './whistle.ts';
import type { WhistleReport } from './types.ts';

function denuncia(over: Partial<WhistleReport> = {}): WhistleReport {
  return {
    id: 'w1',
    category: 'assédio',
    subject: 'Conduta imprópria',
    description: 'relato do que aconteceu',
    isAnonymous: false,
    reporterId: 'u-123',
    status: 'open',
    resolution: '',
    ...over,
  };
}

describe('validateNewReport — uma denúncia nova', () => {
  test('uma denúncia boa passa, nasce open, com id/reporterId/resolution vazios', () => {
    const r = validateNewReport({
      category: '  assédio moral  ',
      subject: '  gerente hostiliza a equipe  ',
      description: '  descrição detalhada do ocorrido  ',
      isAnonymous: false,
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.category, 'assédio moral');
      assert.equal(r.value.subject, 'gerente hostiliza a equipe');
      assert.equal(r.value.description, 'descrição detalhada do ocorrido');
      assert.equal(r.value.isAnonymous, false);
      assert.equal(r.value.status, 'open');
      assert.equal(r.value.id, '');
      assert.equal(r.value.reporterId, null);
      assert.equal(r.value.resolution, '');
    }
  });

  test('⭐ a categoria é OPCIONAL — ausente vira vazia', () => {
    const r = validateNewReport({ subject: 'x', description: 'y' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.category, '');
  });

  test('sem assunto: recusado, com o campo apontado', () => {
    for (const subject of [undefined, null, '', '   ', 42]) {
      const r = validateNewReport({ subject, description: 'y' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'subject'));
    }
  });

  test('sem descrição: recusado (denúncia sem relato não é denúncia)', () => {
    for (const description of [undefined, null, '', '   ', 42]) {
      const r = validateNewReport({ subject: 'x', description });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'description'));
    }
  });

  test('⭐ aceita anônima true', () => {
    const r = validateNewReport({ subject: 'x', description: 'y', isAnonymous: true });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.isAnonymous, true);
  });

  test('⭐ aceita anônima false (o padrão honesto quando ausente)', () => {
    const semFlag = validateNewReport({ subject: 'x', description: 'y' });
    assert.equal(semFlag.ok, true);
    if (semFlag.ok) assert.equal(semFlag.value.isAnonymous, false);

    const flagFalse = validateNewReport({ subject: 'x', description: 'y', isAnonymous: false });
    assert.equal(flagFalse.ok, true);
    if (flagFalse.ok) assert.equal(flagFalse.value.isAnonymous, false);
  });
});

describe('⭐⭐ redactReporter — o guarda de anonimato, puro', () => {
  test('anônima com denunciante informado: reporterId vai a null', () => {
    const bruta = denuncia({ isAnonymous: true, reporterId: 'u-999' });
    const limpa = redactReporter(bruta);
    assert.equal(limpa.reporterId, null);
    assert.equal(limpa.isAnonymous, true);
  });

  test('anônima já sem denunciante: devolve a mesma (idempotente)', () => {
    const bruta = denuncia({ isAnonymous: true, reporterId: null });
    assert.strictEqual(redactReporter(bruta), bruta);
  });

  test('NÃO-anônima: o denunciante é preservado', () => {
    const bruta = denuncia({ isAnonymous: false, reporterId: 'u-123' });
    const limpa = redactReporter(bruta);
    assert.equal(limpa.reporterId, 'u-123');
  });
});

describe('⭐ requiresResolution — encerrar exige desfecho', () => {
  test('true quando o destino é terminal (resolved/dismissed)', () => {
    assert.equal(requiresResolution('under_review', 'resolved'), true);
    assert.equal(requiresResolution('under_review', 'dismissed'), true);
    assert.equal(requiresResolution('open', 'dismissed'), true);
  });

  test('false quando o destino não é terminal', () => {
    assert.equal(requiresResolution('open', 'under_review'), false);
    assert.equal(requiresResolution('open', 'open'), false);
  });
});
