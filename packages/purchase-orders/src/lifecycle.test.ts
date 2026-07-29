import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  ALLOWED_TRANSITIONS,
  canTransition,
  nextStatuses,
  statusForReceipt,
  canCancel,
  canSubmit,
  canReceive,
  validateNewOrder,
  sumItems,
  lineTotalCents,
} from './order.ts';
import type { OrderStatus } from './types.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATION = resolve(HERE, '../../../supabase/migrations/0017_po.sql');

const TODOS: readonly OrderStatus[] = [
  'draft',
  'submitted',
  'partially_received',
  'received',
  'cancelled',
];

describe('ciclo de vida do pedido', () => {
  test('ficar parado é permitido', () => {
    for (const s of TODOS) assert.equal(canTransition(s, s), true);
  });

  test('received NÃO se cancela', () => {
    assert.equal(canTransition('received', 'cancelled'), false);
    assert.equal(canCancel('received'), false);
  });

  test('cancelled é terminal', () => {
    for (const d of TODOS.filter((s) => s !== 'cancelled')) {
      assert.equal(canTransition('cancelled', d), false);
    }
  });

  test('draft → submitted → received', () => {
    assert.equal(canSubmit('draft'), true);
    assert.equal(canTransition('draft', 'submitted'), true);
    assert.equal(canTransition('submitted', 'received'), true);
    assert.equal(canReceive('submitted'), true);
  });

  test('nextStatuses estável', () => {
    assert.deepEqual(nextStatuses('draft'), ['submitted', 'cancelled']);
    assert.deepEqual(nextStatuses('received'), []);
  });
});

describe('recebimento (over-receive permitido)', () => {
  test('parcial e total', () => {
    assert.equal(
      statusForReceipt([{ quantity: 10, qtyReceived: 4 }]),
      'partially_received',
    );
    assert.equal(
      statusForReceipt([{ quantity: 10, qtyReceived: 10 }]),
      'received',
    );
  });

  test('receber a maior ⇒ received (espírito AR)', () => {
    assert.equal(
      statusForReceipt([{ quantity: 10, qtyReceived: 12 }]),
      'received',
    );
  });
});

describe('validação', () => {
  test('pedido válido com itens', () => {
    const r = validateNewOrder({
      externalRef: 'PO-001',
      currency: 'brl',
      items: [{ description: 'Parafuso M6', quantity: 100, unitAmountCents: 25 }],
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'draft');
      assert.equal(r.value.currency, 'BRL');
      assert.equal(r.value.totalCents, 2500);
      assert.equal(r.value.items.length, 1);
    }
  });

  test('sem itens falha', () => {
    const r = validateNewOrder({ externalRef: 'PO-002', currency: 'BRL', items: [] });
    assert.equal(r.ok, false);
  });

  test('soma das linhas', () => {
    assert.equal(lineTotalCents(2.5, 1000), 2500);
    assert.equal(
      sumItems([
        {
          lineNo: 1,
          description: 'a',
          quantity: 2,
          unitAmountCents: 100,
          qtyReceived: 0,
          lineTotalCents: 200,
        },
      ]),
      200,
    );
  });
});

describe('schema e domínio contam a mesma história', () => {
  const sql = readFileSync(MIGRATION, 'utf8');
  const paresDoSql = (() => {
    const inicio = sql.indexOf('create or replace function po.allowed_transition');
    assert.notEqual(inicio, -1);
    const corpo = sql.slice(inicio, sql.indexOf('$$;', inicio));
    const sem = corpo.replace(/--[^\n]*/g, '');
    return [...sem.matchAll(/\(\s*'(\w+)'\s*,\s*'(\w+)'\s*\)/g)].map(
      ([, de, para]) => `${de}→${para}`,
    );
  })();
  const paresDoDominio = ALLOWED_TRANSITIONS.map(([de, para]) => `${de}→${para}`);

  test('mesmos pares SQL ↔ TS', () => {
    assert.deepEqual([...paresDoSql].sort(), [...paresDoDominio].sort());
  });

  test('migration sem DELETE em orders', () => {
    assert.equal(/\bgrant\s+[^;]*\bdelete\b[^;]*\bon\s+po\.orders\b/i.test(sql), false);
  });

  test('module_id po no cinto', () => {
    assert.match(sql, /p_event_type not like 'po\.%'/);
  });
});
