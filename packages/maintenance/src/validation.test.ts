import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { orderBoard, summarizeOrders, validateNewOrder } from './maintenance.ts';
import type { MaintenanceOrder, MntPriority } from './types.ts';

function ordem(over: Partial<MaintenanceOrder> = {}): MaintenanceOrder {
  return {
    id: 'm1',
    title: 'Reparo no portão',
    description: '',
    kind: 'corrective',
    target: 'portão da doca',
    assetId: null,
    priorityId: null,
    assigneeUserId: null,
    recurrenceDays: null,
    costCents: null,
    currency: null,
    status: 'open',
    completedAt: null,
    completionNote: '',
    ...over,
  };
}

describe('validateNewOrder', () => {
  test('o mínimo honesto: título, tipo e alvo', () => {
    const r = validateNewOrder({ title: 'Troca de lâmpada', kind: 'corrective', target: 'corredor B' });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.equal(r.value.status, 'open');
      assert.equal(r.value.recurrenceDays, null);
    }
  });

  test('⛔ sem alvo não há ordem — manter o quê?', () => {
    const r = validateNewOrder({ title: 'X', kind: 'corrective' });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.problems.some((p) => p.field === 'target'));
  });

  test('⛔ tipo fora da física do domínio é recusado', () => {
    const r = validateNewOrder({ title: 'X', kind: 'preditiva', target: 'y' });
    assert.equal(r.ok, false);
  });

  test('⭐ recorrência é da PREVENTIVA — a corretiva responde à falha', () => {
    const ok = validateNewOrder({
      title: 'X', kind: 'preventive', target: 'y', recurrenceDays: 90,
    });
    assert.equal(ok.ok, true);
    const errado = validateNewOrder({
      title: 'X', kind: 'corrective', target: 'y', recurrenceDays: 90,
    });
    assert.equal(errado.ok, false);
    if (!errado.ok) {
      assert.ok(errado.problems.some((p) => p.message.includes('calendário')));
    }
  });

  test('⛔ custo e moeda andam juntos — nos dois sentidos', () => {
    assert.equal(
      validateNewOrder({ title: 'X', kind: 'corrective', target: 'y', costCents: 1000 }).ok,
      false,
    );
    assert.equal(
      validateNewOrder({ title: 'X', kind: 'corrective', target: 'y', currency: 'BRL' }).ok,
      false,
    );
    assert.equal(
      validateNewOrder({ title: 'X', kind: 'corrective', target: 'y', costCents: 1000, currency: 'brl' }).ok,
      true,
    );
  });
});

describe('o quadro e o resumo', () => {
  test('⭐ o quadro ordena pela prioridade DO TENANT', () => {
    const prioridades: MntPriority[] = [
      { id: 'p0', name: 'parada de produção', position: 0, status: 'active' },
      { id: 'p1', name: 'rotina', position: 1, status: 'active' },
    ];
    const quadro = orderBoard(
      [
        ordem({ id: 'a', priorityId: 'p1' }),
        ordem({ id: 'b', priorityId: 'p0' }),
        ordem({ id: 'c', priorityId: null }),
      ],
      prioridades,
    );
    assert.deepEqual(quadro.map((o) => o.id), ['b', 'a', 'c']);
  });

  test('o resumo conta vivas e preventivas devidas', () => {
    const s = summarizeOrders(
      [
        ordem(),
        ordem({ id: 'm2', status: 'in_progress' }),
        ordem({
          id: 'm3',
          kind: 'preventive',
          title: 'Filtro',
          target: 'ar',
          status: 'done',
          completedAt: '2026-01-01T00:00:00Z',
          completionNote: 'feito',
          recurrenceDays: 30,
        }),
      ],
      '2026-07-30',
    );
    assert.deepEqual(s, { total: 3, openish: 2, preventiveDue: 1 });
  });
});
