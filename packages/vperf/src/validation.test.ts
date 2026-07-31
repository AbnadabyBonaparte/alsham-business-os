import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeAppraisals, orderAppraisals, validateNewAppraisal } from './vperf.ts';
import type { Appraisal } from './types.ts';

function avaliacao(over: Partial<Appraisal> = {}): Appraisal {
  return {
    id: 'a1',
    supplierId: 's1',
    supplierName: 'Aço Bonaparte',
    rating: 80,
    summary: 'Entregou no prazo.',
    sourceKind: 'recebimento',
    sourceRef: null,
    appraiserId: 'u1',
    appraisedAt: '2026-06-30T12:00:00Z',
    ...over,
  };
}

describe('validateNewAppraisal — o registro de uma avaliação de fornecedor', () => {
  test('o mínimo honesto: fornecedor (id+nome), nota e parecer passam', () => {
    const r = validateNewAppraisal({
      supplierId: 's1',
      supplierName: '  Aço Bonaparte  ',
      rating: 90,
      summary: '  Excelente serviço  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.supplierName, 'Aço Bonaparte'); // trim
      assert.equal(r.value.rating, 90);
      assert.equal(r.value.summary, 'Excelente serviço');
      assert.equal(r.value.sourceKind, ''); // origem opcional ausente vira vazio
      assert.equal(r.value.sourceRef, null);
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
      assert.equal(r.value.appraiserId, null, 'appraiserId nunca vem da tela — é carimbado pelo servidor');
      assert.equal(r.value.appraisedAt, '');
    }
  });

  test('⭐ a nota é OBRIGATÓRIA — sem ela não registra (o DIVERGE do perf, cuja nota é opcional)', () => {
    for (const rating of [undefined, null, '']) {
      const r = validateNewAppraisal({ supplierId: 's1', supplierName: 'Aço', summary: 'ok', rating });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'rating'));
    }
  });

  test('⭐ a nota vai de 0 a 100 — os limites 0 e 100 passam', () => {
    const zero = validateNewAppraisal({ supplierId: 's1', supplierName: 'Aço', summary: 'ok', rating: 0 });
    assert.equal(zero.ok, true);
    if (zero.ok) assert.equal(zero.value.rating, 0);

    const cem = validateNewAppraisal({ supplierId: 's1', supplierName: 'Aço', summary: 'ok', rating: 100 });
    assert.equal(cem.ok, true);
    if (cem.ok) assert.equal(cem.value.rating, 100);
  });

  test('⛔ nota fora da faixa (-1, 101) ou não-número é recusada no campo rating', () => {
    for (const rating of [-1, 101, 'não é número', {}]) {
      const r = validateNewAppraisal({ supplierId: 's1', supplierName: 'Aço', summary: 'ok', rating });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'rating'));
    }
  });

  test('sem fornecedor (id ou nome) não registra', () => {
    assert.equal(validateNewAppraisal({ supplierName: 'Aço', rating: 80, summary: 'ok' }).ok, false);
    assert.equal(validateNewAppraisal({ supplierId: 's1', rating: 80, summary: 'ok' }).ok, false);
  });

  test('o parecer é OBRIGATÓRIO — sem ele não registra', () => {
    for (const summary of [undefined, null, '', '   ', 42]) {
      const r = validateNewAppraisal({ supplierId: 's1', supplierName: 'Aço', rating: 80, summary });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'summary'));
    }
  });

  test('⭐ a origem é OPCIONAL — texto livre e id solto; ausente vira vazio/null', () => {
    const semOrigem = validateNewAppraisal({ supplierId: 's1', supplierName: 'Aço', rating: 80, summary: 'ok' });
    assert.equal(semOrigem.ok, true);
    if (semOrigem.ok) {
      assert.equal(semOrigem.value.sourceKind, '');
      assert.equal(semOrigem.value.sourceRef, null);
    }

    const comOrigem = validateNewAppraisal({
      supplierId: 's1',
      supplierName: 'Aço',
      rating: 80,
      summary: 'ok',
      sourceKind: 'cotação',
      sourceRef: 'rfq-99',
    });
    assert.equal(comOrigem.ok, true);
    if (comOrigem.ok) {
      assert.equal(comOrigem.value.sourceKind, 'cotação');
      assert.equal(comOrigem.value.sourceRef, 'rfq-99');
    }
  });
});

describe('summarizeAppraisals e orderAppraisals', () => {
  test('a média é a soma das notas / total; toda avaliação tem nota', () => {
    const s = summarizeAppraisals([
      avaliacao({ id: 'a1', rating: 80 }),
      avaliacao({ id: 'a2', rating: 60 }),
    ]);
    assert.deepEqual(s, { total: 2, averageRating: 70 });
  });

  test('⛔ lista vazia é honesta: média null, nunca zero fabricado', () => {
    assert.deepEqual(summarizeAppraisals([]), { total: 0, averageRating: null });
  });

  test('ordena da mais recente para a mais antiga', () => {
    const lista = [
      avaliacao({ id: 'velha', appraisedAt: '2026-01-01T00:00:00Z' }),
      avaliacao({ id: 'nova', appraisedAt: '2026-06-01T00:00:00Z' }),
    ];
    assert.deepEqual(
      orderAppraisals(lista).map((a) => a.id),
      ['nova', 'velha'],
    );
  });
});
