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
    eventId: '00000000-0000-4000-8000-000000000088',
    tenantId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    eventType: CONSUMED_EVENT_TYPE,
    eventVersion: 1,
    producedBy: 'recon',
    occurredAt: '2026-07-28T12:00:00.000Z',
    correlationId: null,
    payload: {
      matchId: '33333333-3333-4333-8333-333333333333',
      decision: 'confirmed',
      targetKind: 'receivable',
      externalRef: 'DOC-CRED-0001',
      matchedAmountCents: 200_000,
      currency: 'BRL',
      ...payload,
    },
    ...over,
  } as EventEnvelope;
}

describe('tradução recon.match.decided → liquidação AR', () => {
  test('caso bom confirma crédito', () => {
    const r = toReconMatchSettlement(envelope());
    assert.equal(r.kind, 'apply');
    if (r.kind !== 'apply') return;
    assert.equal(r.settlement.externalRef, 'DOC-CRED-0001');
    assert.equal(r.settlement.sourceModuleId, 'recon');
    assert.equal(r.settlement.decision, 'confirmed');
    assert.equal(r.settlement.targetKind, 'receivable');
  });

  test('origem vem do envelope', () => {
    const r = toReconMatchSettlement(envelope({ producedBy: 'outro-motor' }));
    assert.equal(r.kind, 'apply');
    if (r.kind !== 'apply') return;
    assert.equal(r.settlement.sourceModuleId, 'outro-motor');
  });

  test('alvo payable é ignorado — não é deste módulo', () => {
    const r = toReconMatchSettlement(envelope({}, { targetKind: 'payable' }));
    assert.equal(r.kind, 'ignore');
  });

  test('tipo estranho é ignorado', () => {
    const r = toReconMatchSettlement(envelope({ eventType: 'recon.approval.decided' }));
    assert.equal(r.kind, 'ignore');
  });

  test('manifesto declara o consumo que o handler cobre', () => {
    assert.ok(
      MANIFEST.events.consumes.some((c) => c.type === CONSUMED_EVENT_TYPE),
      'consumes deve listar recon.match.decided agora que o handler existe',
    );
    assert.equal(CONSUMER_ID, 'ar-recon-match-settlement');
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
    if (out.kind === 'settled') assert.equal(out.effect, 'applied');
    assert.equal(calls.length, 1);
  });
});
