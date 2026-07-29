import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { EventEnvelope } from '@alsham/core';

import {
  CONSUMED_EVENT_TYPE,
  CONSUMER_ID,
  toReconMatchSettlement,
  handleReconMatchSettlement,
  type ReconMatchSettlementPort,
} from './recon-settlement.ts';
import { MANIFEST } from './manifest.ts';

function envelope(
  over: Partial<EventEnvelope> = {},
  payload: Record<string, unknown> = {},
): EventEnvelope {
  return {
    eventId: '00000000-0000-4000-8000-000000000077',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    eventType: CONSUMED_EVENT_TYPE,
    eventVersion: 1,
    producedBy: 'recon',
    occurredAt: '2026-07-28T12:00:00.000Z',
    correlationId: null,
    payload: {
      matchId: '66666666-6666-4666-8666-666666666666',
      decision: 'confirmed',
      targetKind: 'payable',
      externalRef: 'DOC-TRI-0001',
      matchedAmountCents: 150_000,
      currency: 'BRL',
      ...payload,
    },
    ...over,
  } as EventEnvelope;
}

describe('tradução recon.match.decided → liquidação AP', () => {
  test('caso bom confirma débito', () => {
    const r = toReconMatchSettlement(envelope());
    assert.equal(r.kind, 'apply');
    if (r.kind !== 'apply') return;
    assert.equal(r.settlement.targetKind, 'payable');
    assert.equal(r.settlement.sourceModuleId, 'recon');
  });

  test('alvo receivable é ignorado', () => {
    const r = toReconMatchSettlement(envelope({}, { targetKind: 'receivable' }));
    assert.equal(r.kind, 'ignore');
  });

  test('manifesto declara o consumo que o handler cobre', () => {
    assert.ok(MANIFEST.events.consumes.some((c) => c.type === CONSUMED_EVENT_TYPE));
    assert.equal(CONSUMER_ID, 'ap-recon-match-settlement');
  });

  test('handler chama a porta', async () => {
    const calls: unknown[] = [];
    const port: ReconMatchSettlementPort = {
      async applyReconMatch(s) {
        calls.push(s);
        return 'applied';
      },
    };
    const out = await handleReconMatchSettlement(port)(envelope());
    assert.equal(out.kind, 'settled');
    assert.equal(calls.length, 1);
  });
});
