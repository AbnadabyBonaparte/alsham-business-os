import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { orderReadings, summarizeReadings } from './esg.ts';
import type { EsgReading } from './types.ts';
import * as esg from './esg.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0082_esg.sql');
const MIGRATION_PCOST = resolve(HERE, '../../../supabase/migrations/0072_pcost.sql');
const MIGRATION_TIMESHEET = resolve(HERE, '../../../supabase/migrations/0076_timesheet.sql');

const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, ''); // sem comentários

function leitura(over: Partial<EsgReading> = {}): EsgReading {
  return {
    id: 'e1',
    metricType: 'carbon',
    quantity: 10,
    unit: 'tCO2e',
    referenceOn: '2026-07-31',
    sourceId: null,
    sourceName: '',
    note: '',
    ...over,
  };
}

describe('a leitura é ATO IMUTÁVEL — sem ciclo de vida', () => {
  test('⭐ o motor NÃO exporta transição de estado (a ausência é a lei)', () => {
    assert.equal((esg as Record<string, unknown>)['canTransition'], undefined);
    assert.equal((esg as Record<string, unknown>)['ALLOWED_TRANSITIONS'], undefined);
    assert.equal((esg as Record<string, unknown>)['nextStatuses'], undefined);
  });

  test('⭐ a migration NÃO declara allowed_transition/status/updated_at, mas TEM o gatilho de imutabilidade', () => {
    assert.doesNotMatch(code, /create\s+or\s+replace\s+function\s+esg\.allowed_transition/i);
    assert.doesNotMatch(code, /status\s+text/i);
    assert.doesNotMatch(code, /updated_at/i);
    assert.match(code, /before\s+update\s+or\s+delete\s+on\s+esg\.readings/i);
    assert.match(code, /guard_reading_immutable/);
    assert.match(sql, /fato consumado/);
  });

  test('⭐ CAMADA 1: só grant select, insert — o cliente não tem porta de reescrita', () => {
    assert.match(sql, /grant\s+select,\s*insert\s+on\s+esg\.readings\s+to\s+authenticated/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+update\s+on\s+esg\.readings/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+delete\s+on\s+esg\.readings/i);
    assert.doesNotMatch(sql, /grant[^;]*\bupdate\b[^;]*on\s+esg\.readings\s+to\s+authenticated/i);
    assert.doesNotMatch(sql, /grant[^;]*\bdelete\b[^;]*on\s+esg\.readings\s+to\s+authenticated/i);
  });

  test('⭐ CAMADA 2: o gatilho de imutabilidade RAISE com errcode 42501 (nem o dono reescreve)', () => {
    const corpo = sql.split('guard_reading_immutable')[1] ?? '';
    assert.match(corpo, /fato consumado[\s\S]*?errcode\s*=\s*'42501'/);
  });

  test('⭐⭐ o CHECK do tipo exige uma das QUATRO dimensões — física do método, não enum do produto', () => {
    assert.match(
      code,
      /metric_type\s+text\s+not null\s+check\s*\(\s*metric_type in \(\s*'carbon',\s*'water',\s*'energy',\s*'waste'\s*\)\s*\)/i,
    );
    // Não é create type/enum: é CHECK sobre texto.
    assert.doesNotMatch(code, /create\s+type\s+esg\./i);
  });

  test('🔴 a migration NÃO referencia schema alheio — a fonte por id solto (Lei do Lego)', () => {
    // A fonte existe como uuid solto OPCIONAL (sem not null)...
    assert.match(code, /source_id\s+uuid/i);
    assert.doesNotMatch(code, /source_id\s+uuid\s+not null/i);
    // ...e não há FK cruzada a schema de outro módulo (só core.tenants e auth.users).
    const refs = [...code.matchAll(/references\s+([a-z_]+)\./gi)].map((m) => (m[1] ?? '').toLowerCase());
    for (const r of refs) {
      assert.ok(['core', 'auth'].includes(r), `references a schema alheio: ${r}`);
    }
  });
});

describe('⭐⭐ o contraste assinado da quantidade: pcost (<> 0) × timesheet (> 0) × esg (>= 0)', () => {
  const pcost = readFileSync(MIGRATION_PCOST, 'utf8').replace(/--[^\n]*/g, '');
  const timesheet = readFileSync(MIGRATION_TIMESHEET, 'utf8').replace(/--[^\n]*/g, '');

  test('o pcost mede DINHEIRO: amount_cents <> 0 (sinal livre — o estorno é negativo)', () => {
    assert.match(pcost, /amount_cents\s+bigint\s+not null\s+check\s*\(\s*amount_cents\s*<>\s*0\s*\)/i);
  });

  test('o timesheet mede HORAS: hours > 0 (zero é linha muda; negativo não é trabalho)', () => {
    assert.match(timesheet, /hours\s+numeric\s*\(\s*6\s*,\s*2\s*\)\s+not null\s+check\s*\(\s*hours\s*>\s*0\s*\)/i);
  });

  test('⭐⭐ o esg mede uma GRANDEZA FÍSICA: quantity >= 0 (zero é leitura real; negativo é infísico)', () => {
    // A régua do esg é o CHECK real da coluna — distinta das outras duas: a do
    // pcost (amount_cents <> 0) e a do timesheet (hours > 0) são provadas acima,
    // cada uma lendo a SUA migration. As três constraints são textualmente
    // diferentes, e é o CHECK aplicado (não o comentário) que assina cada régua.
    assert.match(code, /quantity\s+numeric\s*\(\s*20\s*,\s*4\s*\)\s+not null\s+check\s*\(\s*quantity\s*>=\s*0\s*\)/i);
    assert.doesNotMatch(code, /amount_cents/i); // não é a régua do pcost
    assert.doesNotMatch(code, /\bhours\b/i); // não é a régua do timesheet
  });
});

describe('a leitura do livro', () => {
  test('orderReadings: do período mais recente ao mais antigo', () => {
    const lista = [
      leitura({ id: 'a', referenceOn: '2026-07-10' }),
      leitura({ id: 'b', referenceOn: '2026-07-31' }),
      leitura({ id: 'c', referenceOn: '2026-07-20' }),
    ];
    assert.deepEqual(orderReadings(lista).map((r) => r.id), ['b', 'c', 'a']);
  });

  test('⭐ summarizeReadings agrupa por (métrica, UNIDADE) — somar kg com toneladas mente', () => {
    const lista = [
      leitura({ id: 'a', metricType: 'carbon', unit: 'tCO2e', quantity: 5 }),
      leitura({ id: 'b', metricType: 'carbon', unit: 'tCO2e', quantity: 3 }),
      leitura({ id: 'c', metricType: 'carbon', unit: 'kg', quantity: 100 }),
      leitura({ id: 'd', metricType: 'water', unit: 'm³', quantity: 40 }),
    ];
    assert.deepEqual(summarizeReadings(lista), {
      total: 4,
      byMetricUnit: [
        { metricType: 'carbon', unit: 'kg', totalQuantity: 100, count: 1 },
        { metricType: 'carbon', unit: 'tCO2e', totalQuantity: 8, count: 2 },
        { metricType: 'water', unit: 'm³', totalQuantity: 40, count: 1 },
      ],
    });
    assert.deepEqual(summarizeReadings([]), { total: 0, byMetricUnit: [] });
  });
});
