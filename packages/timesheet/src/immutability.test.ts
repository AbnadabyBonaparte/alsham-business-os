import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { orderEntries, summarizeEntries, totalHours } from './timesheet.ts';
import type { TimesheetEntry } from './types.ts';
import * as timesheet from './timesheet.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0076_timesheet.sql');
const MIGRATION_ALLOC = resolve(HERE, '../../../supabase/migrations/0071_alloc.sql');

const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, ''); // sem comentários

function apontamento(over: Partial<TimesheetEntry> = {}): TimesheetEntry {
  return {
    id: 't1',
    projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    projectName: 'Obra',
    collaboratorName: 'Ana',
    collaboratorId: null,
    workedOn: '2026-07-31',
    hours: 8,
    description: '',
    ...over,
  };
}

describe('o apontamento é LANÇAMENTO IMUTÁVEL — sem ciclo de vida', () => {
  test('⭐ o motor NÃO exporta transição de estado (a ausência é a lei)', () => {
    assert.equal((timesheet as Record<string, unknown>)['canTransition'], undefined);
    assert.equal((timesheet as Record<string, unknown>)['ALLOWED_TRANSITIONS'], undefined);
    assert.equal((timesheet as Record<string, unknown>)['nextStatuses'], undefined);
  });

  test('⭐ a migration NÃO declara allowed_transition/status/updated_at, mas TEM o gatilho de imutabilidade', () => {
    assert.doesNotMatch(code, /create\s+or\s+replace\s+function\s+timesheet\.allowed_transition/i);
    assert.doesNotMatch(code, /status\s+text/i);
    assert.doesNotMatch(code, /updated_at/i);
    // A imutabilidade é gatilho before update or delete que RAISE.
    assert.match(code, /before\s+update\s+or\s+delete\s+on\s+timesheet\.entries/i);
    assert.match(code, /guard_entry_immutable/);
    assert.match(sql, /fato consumado/);
  });

  test('⭐ CAMADA 1: só grant select, insert — o cliente não tem porta de reescrita', () => {
    assert.match(sql, /grant\s+select,\s*insert\s+on\s+timesheet\.entries\s+to\s+authenticated/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+update\s+on\s+timesheet\.entries/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+delete\s+on\s+timesheet\.entries/i);
    // Nem grant de update/delete ao cliente.
    assert.doesNotMatch(sql, /grant[^;]*\bupdate\b[^;]*on\s+timesheet\.entries\s+to\s+authenticated/i);
    assert.doesNotMatch(sql, /grant[^;]*\bdelete\b[^;]*on\s+timesheet\.entries\s+to\s+authenticated/i);
  });

  test('⭐ CAMADA 2: o gatilho de imutabilidade RAISE com errcode 42501 (nem o dono reescreve)', () => {
    const corpo = sql.split('guard_entry_immutable')[1] ?? '';
    assert.match(corpo, /fato consumado[\s\S]*?errcode\s*=\s*'42501'/);
  });

  test('⭐ o CHECK exige horas > 0 — não se aponta zero nem trabalho negativo', () => {
    assert.match(code, /hours\s+numeric\s*\(\s*6\s*,\s*2\s*\)\s+not null\s+check\s*\(\s*hours\s*>\s*0\s*\)/i);
  });

  test('🔴 a migration NÃO referencia o schema proj nem hr — vínculos por id solto (Lei do Lego)', () => {
    // A palavra "hours" contém "h" mas não "hr." — só o schema alheio é barrado.
    assert.doesNotMatch(sql, /proj\./i);
    assert.doesNotMatch(sql, /hr\./i);
    // O projeto existe como uuid solto obrigatório...
    assert.match(code, /project_id\s+uuid\s+not null/i);
    // ...o colaborador como uuid solto OPCIONAL (sem not null)...
    assert.match(code, /collaborator_id\s+uuid/i);
    // ...e não referencia schema alheio.
    assert.doesNotMatch(code, /references\s+proj\./i);
    assert.doesNotMatch(code, /references\s+hr\./i);
  });
});

describe('⭐ o contraste assinado: timesheet (REALIZADO, imutável) × alloc (PLANEJADO, mutável)', () => {
  const alloc = readFileSync(MIGRATION_ALLOC, 'utf8');
  const allocCode = alloc.replace(/--[^\n]*/g, '');

  test('o alloc é o PLANEJADO: tem percentual e é MUTÁVEL (active ↔ archived)', () => {
    // A régua do alloc é PERCENTUAL de capacidade prevista.
    assert.match(allocCode, /allocation_pct/i);
    assert.match(alloc, /percentual/i);
    // E o alloc é mutável: tem policy de UPDATE e o ciclo active ↔ archived.
    assert.match(allocCode, /create\s+policy\s+alloc_allocations_update/i);
    assert.match(allocCode, /for\s+update\s+to\s+authenticated/i);
    assert.match(allocCode, /'active'/);
    assert.match(allocCode, /'archived'/);
    // O alloc TEM updated_at (é mutável) — o oposto do timesheet.
    assert.match(allocCode, /updated_at/i);
  });

  test('⭐⭐ o timesheet é o REALIZADO: tem HORAS e é IMUTÁVEL (sem update, com gatilho de fato consumado)', () => {
    // A régua do timesheet é HORAS efetivamente trabalhadas.
    assert.match(code, /hours\s+numeric/i);
    // E o timesheet é imutável: gatilho de fato consumado, sem policy de UPDATE.
    assert.match(code, /before\s+update\s+or\s+delete\s+on\s+timesheet\.entries/i);
    assert.match(sql, /fato consumado/);
    assert.doesNotMatch(code, /for\s+update\s+to\s+authenticated/i);
    assert.doesNotMatch(code, /create\s+policy\s+timesheet_entries_update/i);
    // O timesheet NÃO tem updated_at (nada se atualiza).
    assert.doesNotMatch(code, /updated_at/i);
    // E NÃO tem percentual (é hora, não previsão de capacidade).
    assert.doesNotMatch(code, /allocation_pct/i);
  });
});

describe('a leitura do livro', () => {
  test('orderEntries: do dia mais recente ao mais antigo', () => {
    const lista = [
      apontamento({ id: 'a', workedOn: '2026-07-10' }),
      apontamento({ id: 'b', workedOn: '2026-07-31' }),
      apontamento({ id: 'c', workedOn: '2026-07-20' }),
    ];
    assert.deepEqual(
      orderEntries(lista).map((e) => e.id),
      ['b', 'c', 'a'],
    );
  });

  test('totalHours soma as horas — nunca chute', () => {
    const lista = [
      apontamento({ id: 'a', hours: 8 }),
      apontamento({ id: 'b', hours: 4.5 }),
      apontamento({ id: 'c', hours: 2 }),
    ];
    assert.equal(totalHours(lista), 14.5);
    assert.equal(totalHours([]), 0);
  });

  test('summarizeEntries agrupa por colaborador — todo número é soma/length', () => {
    const lista = [
      apontamento({ id: 'a', collaboratorName: 'Ana', hours: 8 }),
      apontamento({ id: 'b', collaboratorName: 'Ana', hours: 2 }),
      apontamento({ id: 'c', collaboratorName: 'Bruno', hours: 5 }),
    ];
    assert.deepEqual(summarizeEntries(lista), {
      total: 3,
      totalHours: 15,
      byCollaborator: [
        { collaboratorName: 'Ana', totalHours: 10, count: 2 },
        { collaboratorName: 'Bruno', totalHours: 5, count: 1 },
      ],
    });
    assert.deepEqual(summarizeEntries([]), { total: 0, totalHours: 0, byCollaborator: [] });
  });
});
