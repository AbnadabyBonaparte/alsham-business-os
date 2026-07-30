import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canArchive,
  canRedeem,
  canRestore,
  canTransition,
  orderHoldings,
  positionOf,
} from './investments.ts';
import type { Holding, Movement } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0046_invest.sql');
const MIGRATION_AR = resolve(HERE, '../../../supabase/migrations/0010_ar.sql');
const MIGRATION_INV = resolve(HERE, '../../../supabase/migrations/0023_inv.sql');

function holding(over: Partial<Holding> = {}): Holding {
  return { id: 'h1', name: 'CDB Banco X', kind: 'CDB', institution: 'Banco X', currency: 'BRL', status: 'active', ...over };
}

function mov(kind: Movement['kind'], amount: number): Movement {
  const signed = kind === 'redemption' ? -amount : amount;
  return { id: `m-${kind}-${amount}`, holdingId: 'h1', kind, amountCents: amount, signedAmountCents: signed, currency: 'BRL', note: '', externalRef: null, occurredOn: '2026-07-15' };
}

describe('o ciclo de vida do investimento — espelho da migration', () => {
  test('ALLOWED_TRANSITIONS é idêntico ao corpo de invest.allowed_transition()', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    const corpo = sql.match(/allowed_transition[\s\S]*?\(p_from, p_to\) in \(([\s\S]*?)\)\s*;/);
    assert.ok(corpo, 'não achei o corpo de invest.allowed_transition na migration');
    const listaSql = corpo[1] ?? '';
    const paresSql = [...listaSql.matchAll(/\('([a-z]+)',\s*'([a-z]+)'\)/g)].map((m) => `${m[1]}->${m[2]}`).sort();
    const paresTs = ALLOWED_TRANSITIONS.map(([f, t]) => `${f}->${t}`).sort();
    assert.deepEqual(paresTs, paresSql);
  });

  test('⭐ o investimento volta do arquivo', () => {
    assert.ok(canArchive('active'));
    assert.ok(canRestore('archived'));
    assert.ok(!canTransition('active', 'active'));
  });
});

describe('a posição — soma dos atos, sem cotação', () => {
  test('aplicação + rendimento − resgate', () => {
    assert.equal(positionOf([mov('application', 100000), mov('yield', 5000)]), 105000);
    assert.equal(positionOf([mov('application', 100000), mov('yield', 5000), mov('redemption', 30000)]), 75000);
    assert.equal(positionOf([]), 0);
  });
});

/**
 * ⭐⭐ A TERCEIRA RESPOSTA — o contraste ar×inv×invest, assinado.
 *
 * O `ar` PERMITE receber a maior; o `inv` PERMITE saldo negativo; o `invest`
 * RECUSA resgatar mais que a posição. Três domínios, três respostas — e este
 * teste lê as três migrations para provar que a divergência é consciente, não
 * cópia esquecida.
 */
describe('⭐⭐ a terceira resposta — resgatar mais que a posição é recusado', () => {
  test('canRedeem: até a posição, sim; além dela, não', () => {
    assert.ok(canRedeem(100000, 100000), 'resgatar a posição inteira é permitido');
    assert.ok(canRedeem(100000, 40000));
    assert.ok(!canRedeem(100000, 100001), 'um centavo além da posição é recusado');
    assert.ok(!canRedeem(0, 1));
    assert.ok(!canRedeem(100000, 0), 'resgate de zero não é resgate');
  });

  test('o gatilho da migration confere a posição no resgate', () => {
    const inv = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.match(inv, /new\.amount_cents > v_position/);
    assert.match(inv, /excede a posição/);
  });

  test('⭐ e as OUTRAS duas respostas são diferentes — o contraste assinado', () => {
    // O ar PERMITE receber a maior (nenhuma trava contra received > amount).
    const ar = readFileSync(MIGRATION_AR, 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(ar, /received_amount_cents\s*<=\s*amount_cents/);
    // O inv PERMITE saldo negativo (nenhuma trava de quantidade não-negativa).
    const invStock = readFileSync(MIGRATION_INV, 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(invStock, /quantity\s*>=\s*0/i);
    // O invest RECUSA — a asserção do canRedeem acima e o gatilho o provam.
    assert.ok(!canRedeem(100000, 100001));
  });
});

describe('a ordem de leitura', () => {
  test('ativos primeiro, arquivados depois; por nome', () => {
    const lista: Holding[] = [
      holding({ id: 'z', name: 'Zeta', status: 'archived' }),
      holding({ id: 'b', name: 'Beta', status: 'active' }),
      holding({ id: 'a', name: 'Alfa', status: 'active' }),
    ];
    assert.deepEqual(orderHoldings(lista).map((h) => h.id), ['a', 'b', 'z']);
  });
});
