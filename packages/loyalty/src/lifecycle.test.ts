import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as loyalty from './loyalty.ts';

/**
 * ⭐⭐ O DIVERGE ASSINADO — loyalty × pcost/timesheet.
 *
 * Copiar sem pensar e divergir sem escrever são o mesmo erro (CLAUDE.md). Este
 * teste lê as três migrations e ASSINA o que se MANTÉM e o que DIVERGE — para
 * que a decisão fique no disco, não só na cabeça de quem a tomou.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const LOYALTY = resolve(HERE, '../../../supabase/migrations/0089_loyalty.sql');
const TIMESHEET = resolve(HERE, '../../../supabase/migrations/0076_timesheet.sql');
const PCOST = resolve(HERE, '../../../supabase/migrations/0072_pcost.sql');
const INVEST = resolve(HERE, '../../../supabase/migrations/0046_invest.sql');

const loy = readFileSync(LOYALTY, 'utf8');
const time = readFileSync(TIMESHEET, 'utf8');
const pc = readFileSync(PCOST, 'utf8');
const invest = readFileSync(INVEST, 'utf8');

const loyCode = loy.replace(/--[^\n]*/g, '');
const timeCode = time.replace(/--[^\n]*/g, '');
const pcCode = pc.replace(/--[^\n]*/g, '');

describe('⭐ o que se MANTÉM — os três são LIVROS IMUTÁVEIS', () => {
  test('nenhum dos três declara allowed_transition (sem ciclo de vida)', () => {
    assert.doesNotMatch(loyCode, /allowed_transition/i);
    assert.doesNotMatch(timeCode, /allowed_transition/i);
    assert.doesNotMatch(pcCode, /allowed_transition/i);
  });

  test('os três têm o gatilho de imutabilidade (before update or delete que RAISE)', () => {
    assert.match(loyCode, /before\s+update\s+or\s+delete\s+on\s+loyalty\.entries/i);
    assert.match(timeCode, /before\s+update\s+or\s+delete\s+on\s+timesheet\.entries/i);
    assert.match(pcCode, /before\s+update\s+or\s+delete\s+on\s+pcost\.entries/i);
    for (const s of [loy, time, pc]) assert.match(s, /fato consumado/);
  });

  test('nenhum dos três tem updated_at (nada se atualiza num fato consumado)', () => {
    assert.doesNotMatch(loyCode, /updated_at/i);
    assert.doesNotMatch(timeCode, /updated_at/i);
    assert.doesNotMatch(pcCode, /updated_at/i);
  });

  test('⭐ o motor do loyalty NÃO exporta transição de estado (a ausência é a lei)', () => {
    assert.equal((loyalty as Record<string, unknown>)['canTransition'], undefined);
    assert.equal((loyalty as Record<string, unknown>)['ALLOWED_TRANSITIONS'], undefined);
    assert.equal((loyalty as Record<string, unknown>)['nextStatuses'], undefined);
  });
});

describe('⭐⭐ o que DIVERGE (a) — a DIREÇÃO mora no TIPO', () => {
  test('o loyalty encoda a direção num CHECK entry_type earn/redeem', () => {
    assert.match(loyCode, /entry_type\s+text\s+not null\s+check\s*\(\s*entry_type\s+in\s*\(\s*'earn',\s*'redeem'\s*\)\s*\)/i);
  });

  test('o timesheet NÃO tem tipo earn/redeem — acumula numa direção só (horas)', () => {
    assert.doesNotMatch(timeCode, /'earn'/i);
    assert.doesNotMatch(timeCode, /'redeem'/i);
    assert.doesNotMatch(timeCode, /entry_type/i);
  });

  test('o pcost também não é earn/redeem — é livro de gasto (sinal no número)', () => {
    assert.doesNotMatch(pcCode, /'earn'/i);
    assert.doesNotMatch(pcCode, /'redeem'/i);
  });
});

describe('⭐⭐ o que DIVERGE (b) — a regra da MAGNITUDE, lida nas três CHECKs', () => {
  test('loyalty: points > 0 estrito (o sinal é o tipo)', () => {
    assert.match(loyCode, /^\s*points\s+integer\s+not null\s+check\s*\(\s*points\s*>\s*0\s*\)/im);
  });

  test('timesheet: hours > 0 estrito (acumula numa direção)', () => {
    assert.match(timeCode, /^\s*hours\s+numeric\s*\(\s*6\s*,\s*2\s*\)\s+not null\s+check\s*\(\s*hours\s*>\s*0\s*\)/im);
  });

  test('pcost: amount_cents <> 0 (sinal LIVRE — > 0 gasto, < 0 crédito)', () => {
    assert.match(pcCode, /^\s*amount_cents\s+bigint\s+not null\s+check\s*\(\s*amount_cents\s*<>\s*0\s*\)/im);
  });
});

describe('⭐⭐ o que DIVERGE (c) — a TERCEIRA resposta: resgatar mais que o saldo é RECUSADO', () => {
  test('o guarda de insert do loyalty soma o saldo e RAISE no resgate a maior', () => {
    // O gatilho existe, soma INTRA-schema o próprio livro, e recusa o redeem que passa.
    assert.match(loyCode, /guard_entry_insert/);
    assert.match(loyCode, /if\s+new\.entry_type\s*=\s*'redeem'/i);
    assert.match(loyCode, /from\s+loyalty\.entries/i);
    assert.match(loy, /saldo de pontos insuficiente/i);
    // A conta é a mesma do computeBalance: earn soma, redeem subtrai.
    assert.match(loyCode, /when\s+entry_type\s*=\s*'earn'\s+then\s+points\s+else\s+-points/i);
  });

  test('o motor concorda: canRedeem recusa acima do saldo, aceita até o saldo cheio', () => {
    const livro = [
      { id: 'a', customerId: 'c1', customerName: '', entryType: 'earn' as const, points: 100, reason: '', sourceId: null },
      { id: 'b', customerId: 'c1', customerName: '', entryType: 'redeem' as const, points: 40, reason: '', sourceId: null },
    ];
    assert.equal(loyalty.computeBalance(livro), 60);
    assert.equal(loyalty.canRedeem(livro, 60), true);
    assert.equal(loyalty.canRedeem(livro, 61), false);
  });

  test('⭐ o precedente assinado: o invest também recusa resgatar mais que a posição', () => {
    assert.match(invest, /resgatar mais que a posição/i);
  });
});
