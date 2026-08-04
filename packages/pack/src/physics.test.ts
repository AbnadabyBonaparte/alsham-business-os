import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { balanceOf, canConsume, isExhausted } from './pack.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0115_pack.sql');
const MIGRATION_LOYALTY = resolve(HERE, '../../../supabase/migrations/0089_loyalty.sql');
const migration = readFileSync(MIGRATION, 'utf8');
const migrationCode = migration.replace(/--[^\n]*/g, '');

describe('⭐ o saldo é cálculo (total − usos), NUNCA coluna — a física do loyalty', () => {
  test('balanceOf: remaining = total − usados', () => {
    const b = balanceOf(10, 3);
    assert.equal(b.totalSessions, 10);
    assert.equal(b.usedCount, 3);
    assert.equal(b.remaining, 7);
  });

  test('⭐⭐ a terceira resposta na régua de tela: sem saldo, não se consome', () => {
    assert.equal(canConsume(balanceOf(2, 0)), true);
    assert.equal(canConsume(balanceOf(2, 1)), true);
    assert.equal(canConsume(balanceOf(2, 2)), false);
    assert.equal(isExhausted(balanceOf(2, 2)), true);
  });

  test('⛔ o saldo NÃO é coluna na migration — é VIEW security_invoker', () => {
    // Nenhuma coluna remaining/balance nas tabelas; o saldo é a VIEW.
    assert.doesNotMatch(migrationCode, /remaining\s+(integer|int|bigint)\s+/i);
    assert.match(migrationCode, /create\s+view\s+pack\.package_balances[\s\S]*security_invoker\s*=\s*true/i);
  });
});

describe('⭐⭐ o DIVERGE assinado — pack × loyalty', () => {
  const loyalty = readFileSync(MIGRATION_LOYALTY, 'utf8').replace(/--[^\n]*/g, '');

  test('o loyalty tem a DIREÇÃO no entry_type (earn/redeem — carteira fungível)', () => {
    assert.match(loyalty, /entry_type\s+text[\s\S]*check\s*\(entry_type\s+in\s*\(\s*'earn'\s*,\s*'redeem'\s*\)\)/i);
  });

  test('⭐⭐ o pack NÃO tem earn/redeem: não é carteira, é bundle amarrado a UM serviço', () => {
    // Sem direção — o uso só subtrai; o teto é a trave da compra.
    assert.doesNotMatch(migrationCode, /entry_type/i);
    assert.doesNotMatch(migrationCode, /'earn'/i);
    assert.doesNotMatch(migrationCode, /'redeem'/i);
    // A identidade de compra: serviço em texto livre + total que congela (> 0).
    assert.match(migrationCode, /service\s+text\s+not\s+null/i);
    assert.match(migrationCode, /total_sessions\s+integer\s+not\s+null\s+check\s*\(total_sessions\s*>\s*0\)/i);
  });

  test('MANTIDO do loyalty: consumo > saldo RECUSADO, e o guarda soma INTRA-schema', () => {
    // O guarda soma pack.uses (o próprio schema), nunca schema alheio.
    assert.match(migrationCode, /from\s+pack\.uses/i);
    assert.match(migrationCode, /pacote esgotado/);
    assert.doesNotMatch(migrationCode, /from\s+crm\./i);
  });

  test('MANTIDO: o livro de usos é IMUTÁVEL nas duas camadas (sem grant + gatilho)', () => {
    // Nem UPDATE nem DELETE são concedidos nas duas tabelas.
    assert.doesNotMatch(migrationCode, /grant[^;]*update[^;]*on\s+pack\.uses/i);
    assert.doesNotMatch(migrationCode, /grant[^;]*delete[^;]*on\s+pack\.(uses|packages)/i);
    assert.match(migrationCode, /before\s+update\s+or\s+delete\s+on\s+pack\.uses/i);
    assert.match(migrationCode, /before\s+update\s+or\s+delete\s+on\s+pack\.packages/i);
  });
});
