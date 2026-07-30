import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarize, validateNewReview } from './performance.ts';
import type { Review } from './types.ts';

function avaliacao(over: Partial<Review> = {}): Review {
  return {
    id: 'r1',
    cycleId: 'c1',
    revieweeId: 'e1',
    revieweeName: 'Ana Vendedora',
    reviewerId: 'u1',
    rating: 80,
    summary: 'Superou as metas do trimestre.',
    recordedAt: '2026-06-30T12:00:00Z',
    ...over,
  };
}

describe('validateNewReview', () => {
  test('o mínimo honesto: ciclo, avaliado e parecer — nota é opcional', () => {
    const r = validateNewReview({
      cycleId: 'c1',
      revieweeId: 'e1',
      revieweeName: 'Ana',
      summary: 'Foi bem.',
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.rating, null);
      assert.equal(r.value.reviewerId, null, 'reviewerId nunca vem da tela — é carimbado pelo servidor');
    }
  });

  test('⛔ sem ciclo, sem avaliado (id ou nome) ou sem parecer não registra', () => {
    assert.equal(validateNewReview({ revieweeId: 'e1', revieweeName: 'Ana', summary: 'ok' }).ok, false);
    assert.equal(validateNewReview({ cycleId: 'c1', revieweeName: 'Ana', summary: 'ok' }).ok, false);
    assert.equal(validateNewReview({ cycleId: 'c1', revieweeId: 'e1', summary: 'ok' }).ok, false);
    assert.equal(validateNewReview({ cycleId: 'c1', revieweeId: 'e1', revieweeName: 'Ana' }).ok, false);
  });

  test('⭐ a nota é OPCIONAL e vai de 0 a 100 — fora da faixa não registra', () => {
    const semNota = validateNewReview({ cycleId: 'c1', revieweeId: 'e1', revieweeName: 'Ana', summary: 'ok' });
    assert.equal(semNota.ok, true);

    const zero = validateNewReview({ cycleId: 'c1', revieweeId: 'e1', revieweeName: 'Ana', summary: 'ok', rating: 0 });
    assert.equal(zero.ok, true);
    if (zero.ok) assert.equal(zero.value.rating, 0);

    const cem = validateNewReview({ cycleId: 'c1', revieweeId: 'e1', revieweeName: 'Ana', summary: 'ok', rating: 100 });
    assert.equal(cem.ok, true);
    if (cem.ok) assert.equal(cem.value.rating, 100);

    assert.equal(
      validateNewReview({ cycleId: 'c1', revieweeId: 'e1', revieweeName: 'Ana', summary: 'ok', rating: -1 }).ok,
      false,
    );
    assert.equal(
      validateNewReview({ cycleId: 'c1', revieweeId: 'e1', revieweeName: 'Ana', summary: 'ok', rating: 101 }).ok,
      false,
    );
    assert.equal(
      validateNewReview({ cycleId: 'c1', revieweeId: 'e1', revieweeName: 'Ana', summary: 'ok', rating: 'não é número' }).ok,
      false,
    );
  });

  test('nasce sem reviewerId e sem recordedAt — os dois são do servidor', () => {
    const r = validateNewReview({ cycleId: 'c1', revieweeId: 'e1', revieweeName: 'Ana', summary: 'ok' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.reviewerId, null);
      assert.equal(r.value.recordedAt, '');
    }
  });
});

describe('summarize', () => {
  test('conta rated/unrated e tira a média sem inventar número onde não há nota', () => {
    const s = summarize([
      avaliacao({ id: 'r1', rating: 80 }),
      avaliacao({ id: 'r2', rating: 60 }),
      avaliacao({ id: 'r3', rating: null }),
    ]);
    assert.deepEqual(s, { total: 3, rated: 2, unrated: 1, averageRating: 70 });
  });

  test('⛔ sem nenhuma nota, a média é null — não é zero, não é achismo', () => {
    const s = summarize([avaliacao({ rating: null }), avaliacao({ id: 'r2', rating: null })]);
    assert.deepEqual(s, { total: 2, rated: 0, unrated: 2, averageRating: null });
  });

  test('lista vazia é honesta: zero em tudo', () => {
    assert.deepEqual(summarize([]), { total: 0, rated: 0, unrated: 0, averageRating: null });
  });
});
