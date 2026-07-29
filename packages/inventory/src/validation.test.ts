import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  matchesItemQuery,
  permissionForMovement,
  summarizeInventory,
  validateNewItem,
  validateNewMovement,
} from './inventory.ts';
import type { InventoryItem, StockMovement } from './types.ts';

function item(over: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'i1',
    tenantId: 't1',
    description: 'Parafuso 8mm',
    unit: 'un',
    sku: 'PAR-8',
    status: 'active',
    ...over,
  };
}

describe('validar item novo', () => {
  test('descrição e unidade são obrigatórias', () => {
    assert.match(validateNewItem({ description: '  ', unit: 'un' }) ?? '', /descrição/);
    assert.match(validateNewItem({ description: 'Tinta', unit: ' ' }) ?? '', /unidade/);
  });

  test('SKU é opcional — mas em branco não existe', () => {
    assert.equal(validateNewItem({ description: 'Tinta', unit: 'L' }), null);
    assert.equal(validateNewItem({ description: 'Tinta', unit: 'L', sku: null }), null);
    assert.match(validateNewItem({ description: 'Tinta', unit: 'L', sku: '  ' }) ?? '', /SKU/);
    assert.equal(validateNewItem({ description: 'Tinta', unit: 'L', sku: 'T-18' }), null);
  });

  test('unidade é TEXTO LIVRE — "m²", "caixa", "hora" passam', () => {
    for (const unit of ['m²', 'caixa', 'hora', 'kg']) {
      assert.equal(validateNewItem({ description: 'x', unit }), null);
    }
  });
});

describe('validar movimento novo', () => {
  test('entrada e saída exigem quantidade POSITIVA — o sinal é do tipo', () => {
    assert.equal(validateNewMovement({ itemId: 'i1', kind: 'in', quantity: 5 }), null);
    assert.match(
      validateNewMovement({ itemId: 'i1', kind: 'out', quantity: -5 }) ?? '',
      /sinal é do tipo/,
    );
    assert.match(validateNewMovement({ itemId: 'i1', kind: 'in', quantity: 0 }) ?? '', /positivas/);
  });

  test('⭐ ajuste sem razão é recusado — a linha muda esconde o desvio', () => {
    assert.match(
      validateNewMovement({ itemId: 'i1', kind: 'adjustment', quantity: -2 }) ?? '',
      /razão/,
    );
    assert.equal(
      validateNewMovement({
        itemId: 'i1',
        kind: 'adjustment',
        quantity: -2,
        reason: 'quebra na descarga',
      }),
      null,
    );
  });

  test('ajuste de zero não ajusta nada', () => {
    assert.match(
      validateNewMovement({ itemId: 'i1', kind: 'adjustment', quantity: 0, reason: 'x' }) ?? '',
      /zero/,
    );
  });

  test('ajuste NEGATIVO passa — ajustar para menos é o caso clássico', () => {
    assert.equal(
      validateNewMovement({ itemId: 'i1', kind: 'adjustment', quantity: -10, reason: 'perda' }),
      null,
    );
  });

  test('quantidade precisa ser número de verdade', () => {
    assert.match(
      validateNewMovement({ itemId: 'i1', kind: 'in', quantity: Number.NaN }) ?? '',
      /número/,
    );
  });

  test('movimento sem item não existe', () => {
    assert.match(validateNewMovement({ itemId: ' ', kind: 'in', quantity: 1 }) ?? '', /item/);
  });
});

describe('⭐ a permissão depende do TIPO do movimento', () => {
  test('entrada e saída pedem register; ajuste pede adjust', () => {
    assert.equal(permissionForMovement('in'), 'inv.movement.register');
    assert.equal(permissionForMovement('out'), 'inv.movement.register');
    assert.equal(permissionForMovement('adjustment'), 'inv.movement.adjust');
  });
});

describe('busca e resumo', () => {
  test('matchesItemQuery procura em descrição, SKU e unidade', () => {
    assert.equal(matchesItemQuery(item(), 'parafuso'), true);
    assert.equal(matchesItemQuery(item(), 'PAR-8'), true);
    assert.equal(matchesItemQuery(item(), 'un'), true);
    assert.equal(matchesItemQuery(item(), 'tinta'), false);
    assert.equal(matchesItemQuery(item(), '  '), true);
  });

  test('o resumo conta, nunca estima', () => {
    const itens = [
      item({ id: 'i1' }),
      item({ id: 'i2', status: 'archived' }),
      item({ id: 'i3', description: 'Tinta' }),
    ];
    const livro: StockMovement[] = [
      {
        id: 'm1', itemId: 'i1', kind: 'in', quantity: 3, reason: '',
        externalRef: null, location: null, occurredAt: '2026-07-01T00:00:00Z',
      },
      {
        id: 'm2', itemId: 'i3', kind: 'out', quantity: 2, reason: '',
        externalRef: null, location: null, occurredAt: '2026-07-02T00:00:00Z',
      },
    ];
    assert.deepEqual(summarizeInventory(itens, livro), {
      items: 3,
      active: 2,
      archived: 1,
      movements: 2,
      negative: 1,
    });
  });
});
