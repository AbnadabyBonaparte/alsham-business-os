import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { orderCommissions, summarize, totalCents } from './commission.ts';
import type { Commission } from './types.ts';
import * as commission from './commission.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0114_commission.sql');
const MIGRATION_TIMESHEET = resolve(HERE, '../../../supabase/migrations/0076_timesheet.sql');

const sql = readFileSync(MIGRATION, 'utf8');
const code = sql.replace(/--[^\n]*/g, ''); // sem comentários

function comissao(over: Partial<Commission> = {}): Commission {
  return {
    id: 'k1',
    professionalId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    professionalName: 'Ana',
    service: 'corte',
    baseAmountCents: 8000,
    commissionAmountCents: 2400,
    occurredOn: '2026-07-31',
    note: '',
    ...over,
  };
}

describe('a comissão é LANÇAMENTO IMUTÁVEL — sem ciclo de vida', () => {
  test('⭐ o motor NÃO exporta transição de estado (a ausência é a lei)', () => {
    assert.equal((commission as Record<string, unknown>)['canTransition'], undefined);
    assert.equal((commission as Record<string, unknown>)['ALLOWED_TRANSITIONS'], undefined);
    assert.equal((commission as Record<string, unknown>)['nextStatuses'], undefined);
  });

  test('⭐ a migration NÃO declara allowed_transition/status/updated_at, mas TEM o gatilho de imutabilidade', () => {
    assert.doesNotMatch(code, /create\s+or\s+replace\s+function\s+commission\.allowed_transition/i);
    assert.doesNotMatch(code, /status\s+text/i);
    assert.doesNotMatch(code, /updated_at/i);
    // A imutabilidade é gatilho before update or delete que RAISE.
    assert.match(code, /before\s+update\s+or\s+delete\s+on\s+commission\.commissions/i);
    assert.match(code, /guard_commission_immutable/);
    assert.match(sql, /fato consumado/);
  });

  test('⭐ CAMADA 1: só grant select, insert — o cliente não tem porta de reescrita', () => {
    assert.match(sql, /grant\s+select,\s*insert\s+on\s+commission\.commissions\s+to\s+authenticated/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+update\s+on\s+commission\.commissions/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+delete\s+on\s+commission\.commissions/i);
    // Nem grant de update/delete ao cliente.
    assert.doesNotMatch(sql, /grant[^;]*\bupdate\b[^;]*on\s+commission\.commissions\s+to\s+authenticated/i);
    assert.doesNotMatch(sql, /grant[^;]*\bdelete\b[^;]*on\s+commission\.commissions\s+to\s+authenticated/i);
  });

  test('⭐ CAMADA 2: o gatilho de imutabilidade RAISE com errcode 42501 (nem o dono reescreve)', () => {
    const corpo = sql.split('guard_commission_immutable')[1] ?? '';
    assert.match(corpo, /fato consumado[\s\S]*?errcode\s*=\s*'42501'/);
  });

  test('⭐ o CHECK exige commission_amount_cents >= 0 — zero é cortesia, negativo não é comissão', () => {
    assert.match(code, /commission_amount_cents\s+bigint\s+not null\s+check\s*\(\s*commission_amount_cents\s*>=\s*0\s*\)/i);
  });

  test('⚠️ NÃO é motor de cálculo (Lei 7): sem coluna gerada, o base_amount_cents é só informativo', () => {
    assert.doesNotMatch(code, /generated\s+always\s+as/i);
    // O valor-base existe como coluna opcional informativa (>= 0 quando presente).
    assert.match(code, /base_amount_cents\s+bigint\s+check\s*\(\s*base_amount_cents\s+is\s+null\s+or\s+base_amount_cents\s*>=\s*0\s*\)/i);
  });

  test('🔴 a migration NÃO referencia o schema professional — vínculo por id solto (Lei do Lego)', () => {
    assert.doesNotMatch(code, /references\s+professional\./i);
    assert.doesNotMatch(code, /\bprofessional\.\w/i);
    // O profissional existe como uuid solto obrigatório...
    assert.match(code, /professional_id\s+uuid\s+not null/i);
    // ...e não referencia schema alheio.
    assert.doesNotMatch(code, /references\s+cash\./i);
    assert.doesNotMatch(code, /references\s+ap\./i);
  });
});

describe('⭐ o contraste assinado: commission (o valor REGISTRADO) × timesheet (as horas), a MESMA física imutável', () => {
  const timesheet = readFileSync(MIGRATION_TIMESHEET, 'utf8');
  const timesheetCode = timesheet.replace(/--[^\n]*/g, '');

  test('o timesheet é o precedente: livro imutável, sem update, com gatilho de fato consumado', () => {
    assert.match(timesheetCode, /before\s+update\s+or\s+delete\s+on\s+timesheet\.entries/i);
    assert.match(timesheet, /fato consumado/);
    assert.doesNotMatch(timesheetCode, /updated_at/i);
  });

  test('⭐ o commission herda a MESMA física: imutável, sem update, sem updated_at', () => {
    assert.match(code, /before\s+update\s+or\s+delete\s+on\s+commission\.commissions/i);
    assert.match(sql, /fato consumado/);
    assert.doesNotMatch(code, /for\s+update\s+to\s+authenticated/i);
    assert.doesNotMatch(code, /create\s+policy\s+commissions_update/i);
    assert.doesNotMatch(code, /updated_at/i);
    // ⚠️ E, ao contrário de um módulo de folha, NÃO deriva o valor por %.
    assert.doesNotMatch(code, /generated\s+always\s+as/i);
  });
});

describe('a leitura do livro', () => {
  test('orderCommissions: do dia mais recente ao mais antigo', () => {
    const lista = [
      comissao({ id: 'a', occurredOn: '2026-07-10' }),
      comissao({ id: 'b', occurredOn: '2026-07-31' }),
      comissao({ id: 'c', occurredOn: '2026-07-20' }),
    ];
    assert.deepEqual(
      orderCommissions(lista).map((c) => c.id),
      ['b', 'c', 'a'],
    );
  });

  test('totalCents soma as comissões — nunca chute', () => {
    const lista = [
      comissao({ id: 'a', commissionAmountCents: 2400 }),
      comissao({ id: 'b', commissionAmountCents: 1500 }),
      comissao({ id: 'c', commissionAmountCents: 0 }),
    ];
    assert.equal(totalCents(lista), 3900);
    assert.equal(totalCents([]), 0);
  });

  test('summarize agrupa por profissional — todo número é soma/length', () => {
    const lista = [
      comissao({ id: 'a', professionalName: 'Ana', commissionAmountCents: 2400 }),
      comissao({ id: 'b', professionalName: 'Ana', commissionAmountCents: 600 }),
      comissao({ id: 'c', professionalName: 'Bruno', commissionAmountCents: 1500 }),
    ];
    assert.deepEqual(summarize(lista), {
      total: 3,
      totalCents: 4500,
      byProfessional: [
        { professionalName: 'Ana', totalCents: 3000, count: 2 },
        { professionalName: 'Bruno', totalCents: 1500, count: 1 },
      ],
    });
    assert.deepEqual(summarize([]), { total: 0, totalCents: 0, byProfessional: [] });
  });
});
