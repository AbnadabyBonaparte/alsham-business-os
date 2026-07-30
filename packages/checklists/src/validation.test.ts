import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeRuns, validateNewTemplate } from './checklists.ts';
import type { ChecklistRun } from './types.ts';

function execucao(over: Partial<ChecklistRun> = {}): ChecklistRun {
  return {
    id: 'r1',
    templateId: 't1',
    templateName: 'Ronda noturna',
    subject: '',
    status: 'in_progress',
    startedAt: '2026-07-30T08:00:00Z',
    completedAt: null,
    abandonReason: '',
    ...over,
  };
}

describe('validateNewTemplate', () => {
  test('o mínimo honesto: nome e ao menos um item', () => {
    const r = validateNewTemplate({ name: 'Abertura da loja', items: ['Portas destravadas', 'Caixa conferido'] });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.value.items.length, 2);
  });

  test('⛔ prancheta vazia não é inspeção', () => {
    const semItens = validateNewTemplate({ name: 'X', items: [] });
    assert.equal(semItens.ok, false);
    if (!semItens.ok) assert.match(semItens.problems[0]!.message, /vazia/);

    const soVazios = validateNewTemplate({ name: 'X', items: ['  ', ''] });
    assert.equal(soVazios.ok, false);
  });

  test('⛔ sem nome não há modelo', () => {
    const r = validateNewTemplate({ items: ['a'] });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'name'));
  });

  test('itens em branco são descartados, não viram linha', () => {
    const r = validateNewTemplate({ name: 'X', items: ['a', '  ', 'b'] });
    assert.equal(r.ok, true);
    if (r.ok) assert.deepEqual(r.value.items, ['a', 'b']);
  });
});

describe('summarizeRuns', () => {
  test('conta o livro sem inventar número', () => {
    const r = summarizeRuns([
      execucao(),
      execucao({ id: 'r2', status: 'completed', completedAt: 'x' }),
      execucao({ id: 'r3', status: 'abandoned', abandonReason: 'faltou luz' }),
    ]);
    assert.deepEqual(r, { total: 3, running: 1, completed: 1, abandoned: 1 });
  });
});
