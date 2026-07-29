import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canTransition,
  permissionForEntry,
  signedAmountCents,
} from './cashflow.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0029_cash.sql');
const MIGRATION_INV = resolve(HERE, '../../../supabase/migrations/0023_inv.sql');

describe('a categoria vive o ciclo do crm/inv — e a decisão foi re-perguntada', () => {
  test('⭐ archived → active EXISTE: a categoria que volta é a MESMA classificação', () => {
    assert.equal(canTransition('archived', 'active'), true);
    assert.equal(canTransition('active', 'archived'), true);
  });
});

describe('⭐ o sinal é do TIPO, nunca do operador — o desenho do inv no dinheiro', () => {
  test('saída vira negativo; entrada e ajuste mantêm o sinal', () => {
    assert.equal(signedAmountCents({ kind: 'out', amountCents: 500 }), -500);
    assert.equal(signedAmountCents({ kind: 'in', amountCents: 500 }), 500);
    assert.equal(signedAmountCents({ kind: 'adjustment', amountCents: -300 }), -300);
    assert.equal(signedAmountCents({ kind: 'adjustment', amountCents: 300 }), 300);
  });

  test('registrar é operação; ajustar é permissão própria', () => {
    assert.equal(permissionForEntry('in'), 'cash.entry.register');
    assert.equal(permissionForEntry('out'), 'cash.entry.register');
    assert.equal(permissionForEntry('adjustment'), 'cash.entry.adjust');
  });
});

describe('⭐ a tabela de transições é a MESMA nos dois lados', () => {
  function paresDoSql(caminho: string, fn: string): Set<string> {
    const sql = readFileSync(caminho, 'utf8');
    const corpo = sql.split(`create or replace function ${fn}`)[1];
    assert.ok(corpo !== undefined, `${fn} não encontrada em ${caminho}`);
    const bloco = corpo.split('$$;')[0] ?? '';
    const semComentario = bloco
      .split('\n')
      .filter((l) => !l.trimStart().startsWith('--'))
      .join('\n');
    const pares = new Set<string>();
    for (const m of semComentario.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'([a-z_]+)'\s*\)/g)) {
      pares.add(`${m[1]}→${m[2]}`);
    }
    return pares;
  }

  test('cash.allowed_transition() e ALLOWED_TRANSITIONS dizem a mesma coisa', () => {
    const doSql = paresDoSql(MIGRATION, 'cash.allowed_transition');
    const doTs = new Set(ALLOWED_TRANSITIONS.map(([f, t]) => `${f}→${t}`));

    assert.equal(doSql.size, 2, 'o SQL declara dois pares');
    assert.deepEqual([...doSql].sort(), [...doTs].sort());
  });

  /**
   * ⭐⭐ O contraste com o `inv` é EXIGIDO: o livro do estoque aceita
   * QUALQUER data (o físico já aconteceu quando se registra); o caixa
   * RECUSA o futuro (lançamento de amanhã é previsão, e previsão é
   * Orçamento). Se alguém "uniformizar" qualquer lado, este teste reprova
   * e obriga a decisão a ser tomada de novo, por escrito.
   */
  test('⭐⭐ o inv aceita o futuro e o cash NÃO — os dois de propósito', () => {
    const sqlInv = readFileSync(MIGRATION_INV, 'utf8').replace(/--[^\n]*/g, '');
    const sqlCash = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');

    assert.doesNotMatch(
      sqlInv,
      /occurred_at\s*<=\s*(now\(\)|current_date)/,
      'o inv ganhou trava de futuro — lá o físico manda',
    );
    assert.match(
      sqlCash,
      /occurred_on\s*<=\s*current_date/,
      'a trava de futuro do caixa sumiu — previsão entraria como realizado',
    );
  });
});
