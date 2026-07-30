import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizePieces, validateNewPiece } from './editorial.ts';
import type { Piece } from './types.ts';

function pauta(over: Partial<Piece> = {}): Piece {
  return {
    id: 'p1',
    title: 'Pauta',
    brief: '',
    channelId: 'c1',
    currentStageId: 's1',
    plannedOn: '2026-08-10',
    status: 'planned',
    publishedAt: null,
    dropReason: '',
    ...over,
  };
}

describe('validateNewPiece', () => {
  test('o mínimo honesto: título, canal, etapa e a data do plano', () => {
    const r = validateNewPiece({
      title: 'Bastidores da obra',
      channelId: 'c1',
      stageId: 's1',
      plannedOn: '2026-08-10',
    });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.brief, '');
  });

  test('⛔ sem canal não há pauta — onde isso vai ao ar?', () => {
    const r = validateNewPiece({ title: 'X', stageId: 's1', plannedOn: '2026-08-10' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'channelId'));
  });

  test('⛔ sem data não há calendário', () => {
    const r = validateNewPiece({ title: 'X', channelId: 'c1', stageId: 's1', plannedOn: 'amanhã' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'plannedOn'));
  });

  test('⛔ sem etapa não há fluxo', () => {
    const r = validateNewPiece({ title: 'X', channelId: 'c1', plannedOn: '2026-08-10' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'stageId'));
  });
});

describe('summarizePieces', () => {
  test('conta o calendário sem inventar número', () => {
    const r = summarizePieces([
      pauta(),
      pauta({ id: 'p2', status: 'published', publishedAt: 'x', currentStageId: null }),
      pauta({ id: 'p3', status: 'dropped', dropReason: 'r', currentStageId: null }),
      pauta({ id: 'p4' }),
    ]);
    assert.deepEqual(r, { total: 4, planned: 2, published: 1, dropped: 1 });
  });
});
