import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  balanceOf,
  canArchive,
  canRestore,
  canTransition,
  isOverdrawn,
  orderAccounts,
  signedAmountCents,
} from './bank-accounts.ts';
import type { BankAccount, Movement } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0045_bank.sql');
const MIGRATION_INV = resolve(HERE, '../../../supabase/migrations/0023_inv.sql');

function conta(over: Partial<BankAccount> = {}): BankAccount {
  return {
    id: 'a1', name: 'Conta Principal', bankName: 'Banco X', branch: '0001',
    accountNumber: '12345-6', currency: 'BRL', status: 'active', ...over,
  };
}

function mov(kind: Movement['kind'], amount: number): Movement {
  return {
    id: `m-${kind}-${amount}`, accountId: 'a1', kind, amountCents: Math.abs(amount),
    signedAmountCents: kind === 'out' ? -Math.abs(amount) : amount,
    currency: 'BRL', description: '', reason: kind === 'adjustment' ? 'ajuste' : '',
    counterpartyName: '', externalRef: null, transferId: null, occurredOn: '2026-07-15',
  };
}

describe('o ciclo de vida da conta — espelho da migration', () => {
  test('ALLOWED_TRANSITIONS é idêntico ao corpo de bank.allowed_transition()', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    const corpo = sql.match(/allowed_transition[\s\S]*?\(p_from, p_to\) in \(([\s\S]*?)\)\s*;/);
    assert.ok(corpo, 'não achei o corpo de bank.allowed_transition na migration');
    const listaSql = corpo[1] ?? '';
    const paresSql = [...listaSql.matchAll(/\('([a-z]+)',\s*'([a-z]+)'\)/g)].map((m) => `${m[1]}->${m[2]}`).sort();
    const paresTs = ALLOWED_TRANSITIONS.map(([f, t]) => `${f}->${t}`).sort();
    assert.deepEqual(paresTs, paresSql);
  });

  test('⭐ a conta volta do arquivo — archived → active existe', () => {
    assert.ok(canArchive('active'));
    assert.ok(canRestore('archived'));
    assert.ok(!canTransition('active', 'active'));
    assert.ok(!canTransition('archived', 'archived'));
  });
});

describe('o saldo — soma do livro, calculado', () => {
  test('entrada soma, saída subtrai, ajuste segue o sinal', () => {
    assert.equal(balanceOf([mov('in', 100000), mov('out', 30000)]), 70000);
    assert.equal(balanceOf([mov('in', 50000), mov('adjustment', -2000)]), 48000);
    assert.equal(balanceOf([]), 0);
  });

  /**
   * ⭐⭐ O DIVERGE ASSINADO — o saldo NEGATIVO é permitido (cheque especial).
   *
   * É a física do `inv` (saldo negativo permitido) re-perguntada para o
   * dinheiro na conta. Este teste prova que o pacote NÃO trava o negativo, e
   * que a migration do `inv` também permitia negativo — a decisão é a mesma,
   * re-perguntada, não copiada.
   */
  test('⭐⭐ o saldo pode ficar negativo (cheque especial) — contraste inv×bank', () => {
    const saldo = balanceOf([mov('in', 10000), mov('out', 30000)]);
    assert.equal(saldo, -20000);
    assert.ok(isOverdrawn(saldo), 'o saldo abaixo de zero é estado legítimo, não erro');

    // A migration do bank NÃO tem constraint contra saldo negativo.
    const b = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(b, /balance_cents\s*>=\s*0/);
    // E o inv também permite negativo — a mesma verdade, re-perguntada.
    const inv = readFileSync(MIGRATION_INV, 'utf8').replace(/--[^\n]*/g, '');
    assert.doesNotMatch(inv, /quantity\s*>=\s*0|qty\s*>=\s*0/i);
  });

  test('saldo positivo não é overdraft', () => {
    assert.ok(!isOverdrawn(1));
    assert.ok(!isOverdrawn(0));
    assert.ok(isOverdrawn(-1));
  });

  test('⭐ o sinal do movimento vive no pacote (Regra de Ouro) — saída subtrai', () => {
    assert.equal(signedAmountCents('in', 10000), 10000);
    assert.equal(signedAmountCents('out', 10000), -10000);
    assert.equal(signedAmountCents('adjustment', -500), -500);
    assert.equal(signedAmountCents('adjustment', 500), 500);
  });
});

describe('a ordem de leitura', () => {
  test('ativas primeiro, arquivadas depois; por nome', () => {
    const lista: BankAccount[] = [
      conta({ id: 'z', name: 'Zebra', status: 'archived' }),
      conta({ id: 'b', name: 'Banco B', status: 'active' }),
      conta({ id: 'a', name: 'Alfa', status: 'active' }),
    ];
    assert.deepEqual(orderAccounts(lista).map((c) => c.id), ['a', 'b', 'z']);
  });
});
