import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { orderReceipts, summarizeReceipts } from './recv.ts';
import type { Receipt } from './types.ts';
import * as recv from './recv.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0060_recv.sql');
const MIGRATION_AR = resolve(HERE, '../../../supabase/migrations/0010_ar.sql');

function recebimento(over: Partial<Receipt> = {}): Receipt {
  return {
    id: 'r1',
    orderId: null,
    orderRef: '',
    item: 'Item',
    quantity: 1,
    receivedOn: '2026-07-31',
    note: '',
    ...over,
  };
}

describe('o recebimento é ATO PONTUAL — sem ciclo de vida', () => {
  test('⭐ o motor NÃO exporta transição de estado (a ausência é a lei)', () => {
    // Um ato pontual não tem ciclo: nada de canTransition/ALLOWED_TRANSITIONS.
    assert.equal((recv as Record<string, unknown>)['canTransition'], undefined);
    assert.equal((recv as Record<string, unknown>)['ALLOWED_TRANSITIONS'], undefined);
    assert.equal((recv as Record<string, unknown>)['nextStatuses'], undefined);
  });

  test('⭐ a migration do recv NÃO declara allowed_transition, mas DOES ter o gatilho de imutabilidade', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    assert.doesNotMatch(sql, /create\s+or\s+replace\s+function\s+recv\.allowed_transition/i);
    // Nem coluna de status.
    assert.doesNotMatch(sql, /status\s+text/i);
    // A imutabilidade é gatilho before update or delete que RAISE.
    assert.match(sql, /before\s+update\s+or\s+delete\s+on\s+recv\.receipts/i);
    assert.match(sql, /guard_receipt_immutable/);
    assert.match(sql, /fato consumado/);
  });

  test('⭐ SEM policy/grant de update ou delete — o cliente não tem porta de reescrita', () => {
    const sql = readFileSync(MIGRATION, 'utf8');
    // A única concessão sobre a tabela é select, insert.
    assert.match(sql, /grant\s+select,\s*insert\s+on\s+recv\.receipts\s+to\s+authenticated/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+update\s+on\s+recv\.receipts/i);
    assert.doesNotMatch(sql, /create\s+policy[\s\S]*?for\s+delete\s+on\s+recv\.receipts/i);
  });
});

describe('⭐⭐ o paralelo recv × ar: receber a maior é PERMITIDO — a sobra é fato', () => {
  test('o ar (Módulo 5) permite receber a maior — o precedente da física', () => {
    const ar = readFileSync(MIGRATION_AR, 'utf8');
    // O ar recebe dinheiro a mais: o overpay do lado do crédito é permitido.
    assert.match(ar, /receber a maior/i);
    assert.match(ar, /received_amount_cents/);
    // E não há a constraint de "não receber a maior" ativa no ar.
    assert.doesNotMatch(ar.replace(/--[^\n]*/g, ''), /constraint\s+\w*no_overpay/i);
  });

  test('⭐ o recv não tem "quantidade pedida" contra a qual recusar a sobra', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    // A única quantidade do schema é a recebida, com CHECK > 0 e SEM teto.
    assert.match(sql, /quantity\s+numeric\s+not null\s+check\s*\(\s*quantity\s*>\s*0\s*\)/i);
    // Nenhuma coluna de quantidade pedida/esperada — o recv não lê o po.
    assert.doesNotMatch(sql, /ordered_quantity|expected_quantity|quantity_ordered/i);
    // E o motor puro aceita qualquer quantidade > 0, sem teto.
    const grande = recebimento({ quantity: 1_000_000 });
    assert.equal(summarizeReceipts([grande]).totalQuantity, 1_000_000);
  });

  test('⭐ o order_id é ID SOLTO — sem FK cruzada para o po (Lei do Lego)', () => {
    const sql = readFileSync(MIGRATION, 'utf8').replace(/--[^\n]*/g, '');
    // order_id existe como uuid solto...
    assert.match(sql, /order_id\s+uuid/i);
    // ...e NÃO referencia o schema do po.
    assert.doesNotMatch(sql, /references\s+po\./i);
  });
});

describe('a leitura do livro', () => {
  test('orderReceipts: do mais recente ao mais antigo', () => {
    const lista = [
      recebimento({ id: 'a', receivedOn: '2026-07-10' }),
      recebimento({ id: 'b', receivedOn: '2026-07-31' }),
      recebimento({ id: 'c', receivedOn: '2026-07-20' }),
    ];
    assert.deepEqual(
      orderReceipts(lista).map((r) => r.id),
      ['b', 'c', 'a'],
    );
  });

  test('summarizeReceipts conta linhas e soma quantidades', () => {
    const lista = [
      recebimento({ quantity: 3 }),
      recebimento({ quantity: 2.5 }),
      recebimento({ quantity: 10 }),
    ];
    assert.deepEqual(summarizeReceipts(lista), { total: 3, totalQuantity: 15.5 });
    assert.deepEqual(summarizeReceipts([]), { total: 0, totalQuantity: 0 });
  });
});
