import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { EventEnvelope } from '@alsham/core';

import {
  RECEIVABLE_CONSUMED_EVENT_TYPES,
  RECEIVABLE_CONSUMED_EVENT_PATTERN,
  RECEIVABLE_CONSUMER_ID,
  toExternalReceivable,
  handleExternalReceivable,
  type ExternalReceivablePort,
} from './external-receivable.ts';
import { MANIFEST } from './manifest.ts';

function envelope(
  over: Partial<EventEnvelope> = {},
  payload: Record<string, unknown> = {},
): EventEnvelope {
  return {
    eventId: '00000000-0000-4000-8000-000000000099',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    eventType: 'ar.receivable.registered',
    eventVersion: 1,
    producedBy: 'ar',
    occurredAt: '2026-07-28T10:00:00.000Z',
    correlationId: null,
    payload: {
      externalRef: 'DOC-R-2026-0001',
      dueDate: '2026-09-10',
      amountCents: 150_000,
      receivedAmountCents: 0,
      currency: 'BRL',
      counterpartyName: 'Cliente Alfa',
      counterpartyTaxId: null,
      description: 'serviço faturado',
      status: 'open',
      ...payload,
    },
    ...over,
  } as EventEnvelope;
}

describe('tradução ar.receivable → projeção recon', () => {
  test('caso bom', () => {
    const r = toExternalReceivable(envelope());
    assert.equal(r.kind, 'apply');
    if (r.kind !== 'apply') return;
    assert.equal(r.receivable.externalRef, 'DOC-R-2026-0001');
    assert.equal(r.receivable.sourceModuleId, 'ar');
  });

  test('origem vem do envelope', () => {
    const r = toExternalReceivable(envelope({ producedBy: 'erp-bridge' }));
    assert.equal(r.kind, 'apply');
    if (r.kind !== 'apply') return;
    assert.equal(r.receivable.sourceModuleId, 'erp-bridge');
  });

  test('⭐ receber a maior É permitido — não ignora', () => {
    const r = toExternalReceivable(
      envelope({}, { amountCents: 100_000, receivedAmountCents: 150_000, status: 'received' }),
    );
    assert.equal(r.kind, 'apply');
    if (r.kind !== 'apply') return;
    assert.equal(r.receivable.receivedAmountCents, 150_000);
    assert.equal(r.receivable.amountCents, 100_000);
  });

  test('tipo ap.* é ignorado por este tradutor', () => {
    const r = toExternalReceivable(envelope({ eventType: 'ap.payable.registered' }));
    assert.equal(r.kind, 'ignore');
  });

  test('cada tipo em consumes ar.* tem tradução', () => {
    const declarados = MANIFEST.events.consumes
      .map((c) => c.type)
      .filter((t) => t.startsWith('ar.receivable.'));
    assert.deepEqual([...declarados].sort(), [...RECEIVABLE_CONSUMED_EVENT_TYPES].sort());
  });

  test('padrão e consumidor estáveis', () => {
    assert.equal(RECEIVABLE_CONSUMED_EVENT_PATTERN, 'ar.*');
    assert.equal(RECEIVABLE_CONSUMER_ID, 'recon-external-receivable-projection');
  });

  test('handler projeta via porta', async () => {
    const calls: unknown[] = [];
    const port: ExternalReceivablePort = {
      async recordExternalReceivable(receivable) {
        calls.push(receivable);
        return 'created';
      },
    };
    const out = await handleExternalReceivable(port)(envelope());
    assert.equal(out.kind, 'projected');
    assert.equal(calls.length, 1);
  });
});
