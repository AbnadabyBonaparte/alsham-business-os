import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { orderEntries, summarizeEntries } from './pcost.ts';
import type { CostEntry } from './types.ts';
import * as pcost from './pcost.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0072_pcost.sql');
const MIGRATION_FUND = resolve(HERE, '../../../supabase/migrations/0055_fund.sql');

function custo(over: Partial<CostEntry> = {}): CostEntry {
  return {
    id: 'c1',
    projectId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    projectName: 'Obra',
    amountCents: 1000,
    currency: 'BRL',
    category: '',
    incurredOn: '2026-07-31',
    note: '',
    ...over,
  };
}

describe('o custo é LANÇAMENTO IMUTÁVEL — sem ciclo de vida', () => {
  test('⭐ o motor NÃO exporta transição de estado (a ausência é a lei)', () => {
    assert.equal((pcost as Record<string, unknown>)['canTransition'], undefined);
    assert.equal((pcost as Record<string, unknown>)['ALLOWED_TRANSITIONS'], undefined);
    assert.equal((pcost as Record<string, unknown>)['nextStatuses'], undefined);
  });

  test('⭐ a migration do pcost NÃO declara allowed_transition/status/updated_at, mas TEM o gatilho de imutabilidade', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    // As ausências estruturais se conferem no CÓDIGO (comentários stripados).
    const code = sql.replace(/--[^\n]*/g, '');
    assert.doesNotMatch(code, /create\s+or\s+replace\s+function\s+pcost\.allowed_transition/i);
    assert.doesNotMatch(code, /status\s+text/i);
    assert.doesNotMatch(code, /updated_at/i);
    // A imutabilidade é gatilho before update or delete que RAISE.
    assert.match(code, /before\s+update\s+or\s+delete\s+on\s+pcost\.entries/i);
    assert.match(code, /guard_entry_immutable/);
    assert.match(sql, /fato consumado/);
  });

  test('⭐ CAMADA 1: só grant select, insert — o cliente não tem porta de reescrita', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.match(sql, /grant\s+select,\s*insert\s+on\s+pcost\.entries\s+to\s+authenticated/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+update\s+on\s+pcost\.entries/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+delete\s+on\s+pcost\.entries/i);
  });

  test('⭐ CAMADA 2: o gatilho de imutabilidade RAISE com errcode 42501 (nem o dono reescreve)', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    // O corpo da função de imutabilidade fica entre a 1ª e a 2ª menção do nome.
    const corpo = sql.split('guard_entry_immutable')[1] ?? '';
    assert.match(corpo, /fato consumado[\s\S]*?errcode\s*=\s*'42501'/);
  });

  test('🔴 a migration NÃO referencia o schema proj — o projeto é id solto (Lei do Lego)', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.doesNotMatch(sql, /proj\./i);
    // O projeto existe como uuid solto obrigatório...
    assert.match(sql.replace(/--[^\n]*/g, ''), /project_id\s+uuid\s+not null/i);
    // ...e não referencia schema alheio.
    assert.doesNotMatch(sql.replace(/--[^\n]*/g, ''), /references\s+proj\./i);
  });
});

describe('⭐⭐ o DIVERGE do fund: SEM trave de saldo — o custo entra sempre', () => {
  test('o fund (Módulo 40) CONFERE o saldo e RECUSA o negativo — o precedente', () => {
    const fund = readFileSync(MIGRATION_FUND, 'utf8');
    // O fund tem uma guarda de saldo que confere antes de gastar...
    assert.match(fund, /guard_expense_balance/);
    // ...e recusa quando o saldo ficaria negativo.
    assert.match(fund, /não pode ficar negativo/i);
    assert.match(fund.replace(/--[^\n]*/g, ''), /v_balance\s*-\s*new\.amount_cents\s*\)\s*<\s*0/i);
  });

  test('⭐⭐ o pcost NÃO tem nenhuma guarda de saldo — não há piso', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    // Nenhuma função/gatilho de conferência de saldo.
    assert.doesNotMatch(sql, /guard_.*balance/i);
    assert.doesNotMatch(sql, /não pode ficar negativo/i);
    // O CHECK do valor só recusa zero — sinal LIVRE, SEM piso nem teto.
    assert.match(sql, /amount_cents\s+bigint\s+not null\s+check\s*\(\s*amount_cents\s*<>\s*0\s*\)/i);
    // E não há coluna nem view de saldo.
    assert.doesNotMatch(sql, /balance/i);
  });

  test('⭐ o motor puro aceita um valor enorme (positivo ou negativo) sem recusa de saldo', () => {
    const grandePositivo = custo({ amountCents: 999_999_999 });
    const grandeNegativo = custo({ amountCents: -999_999_999, id: 'c2' });
    const resumo = summarizeEntries([grandePositivo, grandeNegativo]);
    assert.equal(resumo.total, 2);
    // summarizeEntries é um TOTAL por moeda, nunca um saldo com trave.
    assert.deepEqual(resumo.byCurrency, [{ currency: 'BRL', totalCents: 0, count: 2 }]);
  });
});

describe('a leitura do livro', () => {
  test('orderEntries: do mais recente ao mais antigo', () => {
    const lista = [
      custo({ id: 'a', incurredOn: '2026-07-10' }),
      custo({ id: 'b', incurredOn: '2026-07-31' }),
      custo({ id: 'c', incurredOn: '2026-07-20' }),
    ];
    assert.deepEqual(
      orderEntries(lista).map((e) => e.id),
      ['b', 'c', 'a'],
    );
  });

  test('summarizeEntries soma por moeda — todo número é soma/length, nunca chute', () => {
    const lista = [
      custo({ id: 'a', amountCents: 300, currency: 'BRL' }),
      custo({ id: 'b', amountCents: 200, currency: 'BRL' }),
      custo({ id: 'c', amountCents: 1000, currency: 'USD' }),
    ];
    assert.deepEqual(summarizeEntries(lista), {
      total: 3,
      byCurrency: [
        { currency: 'BRL', totalCents: 500, count: 2 },
        { currency: 'USD', totalCents: 1000, count: 1 },
      ],
    });
    assert.deepEqual(summarizeEntries([]), { total: 0, byCurrency: [] });
  });
});
