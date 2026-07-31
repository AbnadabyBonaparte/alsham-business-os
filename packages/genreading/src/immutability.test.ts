import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { orderReadings, summarizeByPlant } from './genreading.ts';
import type { GenerationReading } from './types.ts';
import * as genreading from './genreading.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0098_genreading.sql');
const MIGRATION_ESG = resolve(HERE, '../../../supabase/migrations/0082_esg.sql');

const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, ''); // sem comentários

function leitura(over: Partial<GenerationReading> = {}): GenerationReading {
  return {
    id: 'g1',
    plantId: 'usina-a',
    plantName: '',
    generatedKwh: 10,
    unit: 'kWh',
    referenceOn: '2026-07-31',
    note: '',
    ...over,
  };
}

describe('a leitura é ATO IMUTÁVEL — sem ciclo de vida', () => {
  test('⭐ o motor NÃO exporta transição de estado (a ausência é a lei)', () => {
    assert.equal((genreading as Record<string, unknown>)['canTransition'], undefined);
    assert.equal((genreading as Record<string, unknown>)['ALLOWED_TRANSITIONS'], undefined);
    assert.equal((genreading as Record<string, unknown>)['nextStatuses'], undefined);
  });

  test('⭐ a migration NÃO declara allowed_transition/status/updated_at, mas TEM o gatilho de imutabilidade', () => {
    assert.doesNotMatch(code, /create\s+or\s+replace\s+function\s+genreading\.allowed_transition/i);
    assert.doesNotMatch(code, /allowed_transition/i);
    assert.doesNotMatch(code, /status\s+text/i);
    assert.doesNotMatch(code, /updated_at/i);
    assert.match(code, /before\s+update\s+or\s+delete\s+on\s+genreading\.readings/i);
    assert.match(code, /guard_reading_immutable/);
    assert.match(sql, /fato consumado/);
  });

  test('⭐ o schema NÃO tem coluna de status nem updated_at na tabela de leituras', () => {
    // Isola o corpo do create table (a palavra "status" aparece só no insert do
    // emit_event em core.event_outbox — não é coluna desta tabela).
    const corpoTabela = code.split(/create\s+table\s+genreading\.readings\s*\(/i)[1]?.split(');')[0] ?? '';
    assert.ok(corpoTabela.length > 0, 'não encontrei o corpo da tabela genreading.readings');
    assert.doesNotMatch(corpoTabela, /\bstatus\b/i);
    assert.doesNotMatch(corpoTabela, /updated_at/i);
  });

  test('⭐ CAMADA 1: só grant select, insert — o cliente não tem porta de reescrita', () => {
    assert.match(sql, /grant\s+select,\s*insert\s+on\s+genreading\.readings\s+to\s+authenticated/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+update\s+on\s+genreading\.readings/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+delete\s+on\s+genreading\.readings/i);
    assert.doesNotMatch(sql, /grant[^;]*\bupdate\b[^;]*on\s+genreading\.readings\s+to\s+authenticated/i);
    assert.doesNotMatch(sql, /grant[^;]*\bdelete\b[^;]*on\s+genreading\.readings\s+to\s+authenticated/i);
  });

  test('⭐ CAMADA 2: o gatilho de imutabilidade RAISE com errcode 42501 (nem o dono reescreve)', () => {
    const corpo = sql.split('guard_reading_immutable')[1] ?? '';
    assert.match(corpo, /fato consumado[\s\S]*?errcode\s*=\s*'42501'/);
  });

  test('🔴 a migration NÃO referencia schema alheio — a usina por id solto (Lei do Lego)', () => {
    // A usina é OBRIGATÓRIA (o DIVERGE do esg) mas continua uuid solto: sem FK...
    assert.match(code, /plant_id\s+uuid\s+not null/i);
    // ...e não há FK cruzada a schema de outro módulo (só core.tenants e auth.users).
    const refs = [...code.matchAll(/references\s+([a-z_]+)\./gi)].map((m) => (m[1] ?? '').toLowerCase());
    for (const r of refs) {
      assert.ok(['core', 'auth'].includes(r), `references a schema alheio: ${r}`);
    }
  });
});

describe('⭐ o DIVERGE assinado: genreading (plant OBRIGATÓRIA) × esg (source OPCIONAL)', () => {
  const esgCode = readFileSync(MIGRATION_ESG, 'utf8').replace(/--[^\n]*/g, '');

  test('⭐⭐ generated_kwh >= 0 — o MANTIDO do esg (não > 0, não <> 0): zero é leitura real, negativo infísico', () => {
    assert.match(code, /generated_kwh\s+numeric\s*\(\s*20\s*,\s*4\s*\)\s+not null\s+check\s*\(\s*generated_kwh\s*>=\s*0\s*\)/i);
    // Não é a régua estrita nem a de sinal livre.
    assert.doesNotMatch(code, /generated_kwh\s+numeric[^)]*check\s*\(\s*generated_kwh\s*>\s*0\s*\)/i);
    assert.doesNotMatch(code, /generated_kwh\s+numeric[^)]*check\s*\(\s*generated_kwh\s*<>\s*0\s*\)/i);
  });

  test('⭐ o esg tem a fonte OPCIONAL; o genreading tem a usina OBRIGATÓRIA', () => {
    // No esg a fonte é uuid solto SEM not null.
    assert.match(esgCode, /source_id\s+uuid/i);
    assert.doesNotMatch(esgCode, /source_id\s+uuid\s+not null/i);
    // No genreading a usina é uuid solto COM not null — o DIVERGE assinado.
    assert.match(code, /plant_id\s+uuid\s+not null/i);
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

  test('⭐ summarizeByPlant soma a geração por usina, em ordem estável por plantId', () => {
    const lista = [
      leitura({ id: 'a', plantId: 'usina-b', generatedKwh: 5 }),
      leitura({ id: 'b', plantId: 'usina-a', generatedKwh: 3 }),
      leitura({ id: 'c', plantId: 'usina-a', generatedKwh: 7 }),
      leitura({ id: 'd', plantId: 'usina-b', generatedKwh: 40 }),
    ];
    assert.deepEqual(summarizeByPlant(lista), [
      { plantId: 'usina-a', totalKwh: 10, readingCount: 2 },
      { plantId: 'usina-b', totalKwh: 45, readingCount: 2 },
    ]);
    assert.deepEqual(summarizeByPlant([]), []);
  });
});
