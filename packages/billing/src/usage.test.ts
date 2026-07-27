import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  METRICS,
  checkLimit,
  eventUsageHook,
  findLimit,
  periodOf,
  usedInPeriod,
} from './index.ts';
import type { PlanLimit, UsageEntry, UsageRecorder } from './index.ts';

/** Planos fictícios, com os mesmos códigos genéricos do seed. */
const LIMITS: PlanLimit[] = [
  { planCode: 'free', metric: 'seats', limit: 3, onExceed: 'block' },
  { planCode: 'free', metric: 'events-per-month', limit: 10_000, onExceed: 'block' },
  { planCode: 'starter', metric: 'events-per-month', limit: 250_000, onExceed: 'meter' },
  { planCode: 'pro', metric: 'events-per-month', limit: null, onExceed: 'meter' },
];

describe('checkLimit', () => {
  test('dentro do teto passa', () => {
    const v = checkLimit({ limit: findLimit(LIMITS, 'free', 'seats'), used: 2, quantity: 1 });
    assert.equal(v.allowed, true);
    assert.equal(v.reason, 'within-limit');
  });

  test('plano sem teto é ilimitado', () => {
    const v = checkLimit({
      limit: findLimit(LIMITS, 'pro', 'events-per-month'),
      used: 9_000_000,
      quantity: 1,
    });
    assert.equal(v.allowed, true);
    assert.equal(v.reason, 'unlimited');
  });

  test("on_exceed 'block' corta ao estourar", () => {
    const v = checkLimit({ limit: findLimit(LIMITS, 'free', 'seats'), used: 3, quantity: 1 });
    assert.equal(v.allowed, false);
    assert.equal(v.reason, 'blocked');
  });

  test("on_exceed 'meter' deixa passar e mede o excedente", () => {
    const v = checkLimit({
      limit: findLimit(LIMITS, 'starter', 'events-per-month'),
      used: 249_999,
      quantity: 10,
    });
    assert.equal(v.allowed, true);
    assert.equal(v.reason, 'metered');
    assert.equal(v.reason === 'metered' ? v.overage : -1, 9);
  });

  test('exatamente no teto ainda passa — o teto é inclusivo', () => {
    const v = checkLimit({ limit: findLimit(LIMITS, 'free', 'seats'), used: 2, quantity: 1 });
    assert.equal(v.allowed, true);
  });

  test('⚠️ métrica sem teto configurado NEGA — falta de regra não é permissão', () => {
    // É assim que um plano gratuito vira ilimitado por esquecimento, e
    // ninguém descobre até a fatura de infraestrutura chegar.
    const v = checkLimit({ limit: findLimit(LIMITS, 'free', 'storage-mb'), used: 0, quantity: 1 });
    assert.equal(v.allowed, false);
    assert.equal(v.reason, 'no-limit-configured');
  });
});

describe('período de apuração', () => {
  test('é UTC — o mês não muda com o fuso do servidor', () => {
    assert.equal(periodOf(new Date('2026-07-27T12:00:00Z')), '2026-07');
    // 23h59 de 31/07 em UTC ainda é julho, não agosto.
    assert.equal(periodOf(new Date('2026-07-31T23:59:59Z')), '2026-07');
    assert.equal(periodOf(new Date('2026-08-01T00:00:00Z')), '2026-08');
  });

  test('soma só a métrica e o período pedidos', () => {
    const e = (over: Partial<UsageEntry>): UsageEntry => ({
      id: 'x',
      tenantId: 't',
      metric: 'events-per-month',
      quantity: 1,
      period: '2026-07',
      sourceModuleId: null,
      sourceRef: null,
      recordedAt: '2026-07-01T00:00:00.000Z',
      ...over,
    });
    const entries = [
      e({ quantity: 5 }),
      e({ quantity: 3 }),
      e({ quantity: 99, period: '2026-06' }),
      e({ quantity: 99, metric: 'seats' }),
    ];
    assert.equal(usedInPeriod(entries, 'events-per-month', '2026-07'), 8);
  });
});

describe('o gancho que liga o correio à cobrança', () => {
  test('cada evento entregue vira 1 unidade de events-per-month', async () => {
    const gravados: unknown[] = [];
    const recorder: UsageRecorder = {
      async record(input) {
        gravados.push(input);
      },
    };

    const hook = eventUsageHook(recorder, () => new Date('2026-07-27T10:00:00Z'));
    await hook({
      tenantId: 'tenant-a',
      eventId: 'evt-1',
      eventType: 'recon.reconciliation.completed',
      producedBy: 'recon',
    });

    assert.deepEqual(gravados, [
      {
        tenantId: 'tenant-a',
        metric: METRICS.eventsPerMonth,
        quantity: 1,
        period: '2026-07',
        sourceModuleId: 'recon',
        // O event_id é a chave de idempotência: reentrega do mesmo evento
        // não conta duas vezes, porque o ledger tem unique nessa chave.
        sourceRef: 'evt-1',
      },
    ]);
  });
});
