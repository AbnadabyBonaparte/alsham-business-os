import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeNotices, validateNewNotice } from './comms.ts';
import type { Notice } from './types.ts';

function comunicado(over: Partial<Notice> = {}): Notice {
  return {
    id: 'n1',
    title: 'Aviso',
    body: '',
    audience: 'todos',
    status: 'draft',
    publishedAt: null,
    correctsNoticeId: null,
    correctsTitle: '',
    ...over,
  };
}

describe('validateNewNotice', () => {
  test('o mínimo honesto: título e audiência — o corpo pode vir depois', () => {
    const r = validateNewNotice({ title: 'Recesso de fim de ano', audience: 'todos' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'draft');
      assert.equal(r.value.body, '');
    }
  });

  test('⛔ sem audiência não há comunicado — para quem se fala?', () => {
    const r = validateNewNotice({ title: 'X' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.problems[0]!.message, /audiência/);
  });

  test('⛔ sem título não há comunicado', () => {
    const r = validateNewNotice({ audience: 'todos' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'title'));
  });
});

describe('summarizeNotices', () => {
  test('conta o mural sem inventar número', () => {
    const r = summarizeNotices([
      comunicado({ status: 'published', publishedAt: 'x' }),
      comunicado({ id: 'n2' }),
      comunicado({ id: 'n3', status: 'archived', publishedAt: 'x' }),
    ]);
    assert.deepEqual(r, { total: 3, onBoard: 1, drafts: 1, archived: 1 });
  });
});
