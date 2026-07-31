import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeAppraisals, orderAppraisals, validateNewAppraisal } from './logperf.ts';
import type { Appraisal } from './types.ts';

function avaliacao(over: Partial<Appraisal> = {}): Appraisal {
  return {
    id: 'a1',
    subject: 'Rota SP→RJ',
    dcCenterId: null,
    rating: 80,
    summary: 'Entregou no prazo.',
    assessedOn: '2026-06-30',
    appraiserId: 'u1',
    appraisedAt: '2026-06-30T12:00:00Z',
    ...over,
  };
}

describe('validateNewAppraisal — o registro de uma avaliação de performance logística', () => {
  test('o mínimo honesto: avaliado (subject), nota e parecer passam', () => {
    const r = validateNewAppraisal({
      subject: '  Rota SP→RJ  ',
      rating: 90,
      summary: '  Excelente performance  ',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.subject, 'Rota SP→RJ'); // trim
      assert.equal(r.value.rating, 90);
      assert.equal(r.value.summary, 'Excelente performance');
      assert.equal(r.value.dcCenterId, null); // vínculo opcional ausente vira null
      assert.equal(r.value.assessedOn, null); // data opcional ausente vira null
      assert.equal(r.value.id, ''); // a pura camada nunca inventa dado do servidor
      assert.equal(r.value.appraiserId, null, 'appraiserId nunca vem da tela — é carimbado pelo servidor');
      assert.equal(r.value.appraisedAt, '');
    }
  });

  test('⭐ a nota é OBRIGATÓRIA — sem ela não registra (a régua do método)', () => {
    for (const rating of [undefined, null, '']) {
      const r = validateNewAppraisal({ subject: 'Rota', summary: 'ok', rating });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'rating'));
    }
  });

  test('⭐ a nota vai de 0 a 100 — os limites 0 e 100 passam', () => {
    const zero = validateNewAppraisal({ subject: 'Rota', summary: 'ok', rating: 0 });
    assert.equal(zero.ok, true);
    if (zero.ok) assert.equal(zero.value.rating, 0);

    const cem = validateNewAppraisal({ subject: 'Rota', summary: 'ok', rating: 100 });
    assert.equal(cem.ok, true);
    if (cem.ok) assert.equal(cem.value.rating, 100);
  });

  test('⛔ nota fora da faixa (-1, 101) ou não-número é recusada no campo rating', () => {
    for (const rating of [-1, 101, 'não é número', {}]) {
      const r = validateNewAppraisal({ subject: 'Rota', summary: 'ok', rating });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'rating'));
    }
  });

  test('⭐ o DIVERGE do vperf: o avaliado é TEXTO LIVRE — sem subject não registra', () => {
    for (const subject of [undefined, null, '', '   ', 42]) {
      const r = validateNewAppraisal({ subject, rating: 80, summary: 'ok' });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'subject'));
    }
  });

  test('subject longo demais (> 200) é recusado', () => {
    const r = validateNewAppraisal({ subject: 'x'.repeat(201), rating: 80, summary: 'ok' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'subject'));
  });

  test('o parecer é OBRIGATÓRIO — sem ele não registra; e > 1000 é recusado', () => {
    for (const summary of [undefined, null, '', '   ', 42]) {
      const r = validateNewAppraisal({ subject: 'Rota', rating: 80, summary });
      assert.equal(r.ok, false);
      if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'summary'));
    }
    const longo = validateNewAppraisal({ subject: 'Rota', rating: 80, summary: 'x'.repeat(1001) });
    assert.equal(longo.ok, false);
    if (!longo.ok) assert.ok(longo.problems.some((p) => p.field === 'summary'));
  });

  test('⭐ o vínculo ao centro (dcCenterId) e a data (assessedOn) são OPCIONAIS', () => {
    const sem = validateNewAppraisal({ subject: 'Rota', rating: 80, summary: 'ok' });
    assert.equal(sem.ok, true);
    if (sem.ok) {
      assert.equal(sem.value.dcCenterId, null);
      assert.equal(sem.value.assessedOn, null);
    }

    const com = validateNewAppraisal({
      subject: 'CD Interior',
      rating: 70,
      summary: 'ok',
      dcCenterId: 'center-99',
      assessedOn: '2027-01-31',
    });
    assert.equal(com.ok, true);
    if (com.ok) {
      assert.equal(com.value.dcCenterId, 'center-99');
      assert.equal(com.value.assessedOn, '2027-01-31');
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
