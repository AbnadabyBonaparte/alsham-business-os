import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { EventEnvelope } from '@alsham/core';

import {
  CONSUMED_EVENT_PATTERN,
  CONSUMED_EVENT_TYPES,
  CONSUMER_ID,
  handleDunTitle,
  toExternalTitle,
} from './dun-title.ts';
import type { ExternalTitle } from './dun-title.ts';

function envelope(over: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    eventId: '00000000-0000-4000-8000-000000000001',
    eventType: 'ar.receivable.registered',
    eventVersion: 1,
    tenantId: '00000000-0000-4000-8000-0000000000aa',
    occurredAt: '2026-07-29T12:00:00Z',
    producedBy: 'ar',
    payload: {
      externalRef: 'DOC-0001',
      dueDate: '2026-07-01',
      amountCents: 100000,
      receivedAmountCents: 0,
      currency: 'BRL',
      payerName: 'Devedor Um',
      counterpartyTaxId: '00.000.000/0001-00',
      description: 'mensalidade',
      status: 'open',
    },
    ...over,
  };
}

describe('a tradução do fato para a régua', () => {
  test('o fato bom vira projeção, com a ORIGEM do envelope', () => {
    const r = toExternalTitle(envelope());
    assert.equal(r.kind, 'apply');
    if (r.kind === 'apply') {
      assert.equal(r.title.externalRef, 'DOC-0001');
      assert.equal(r.title.sourceModuleId, 'ar', 'a origem vem de producedBy');
      assert.equal(r.title.payerName, 'Devedor Um');
      assert.equal(r.title.status, 'open');
    }
  });

  /**
   * ⭐ A prova de que a origem NÃO está chumbada: um produtor fictício
   * emitindo o MESMO formato grava a origem DELE. É a guarda de CI em forma
   * de teste — e o cenário do teste triangular no banco.
   */
  test('⭐ um segundo produtor do mesmo formato grava a origem DELE', () => {
    const r = toExternalTitle(
      envelope({ eventType: 'erp-bridge.receivable.registered', producedBy: 'erp-bridge' }),
    );
    assert.equal(r.kind, 'apply');
    if (r.kind === 'apply') {
      assert.equal(r.title.sourceModuleId, 'erp-bridge');
    }
  });

  test('payload alheio é IGNORADO sem erro — não enche dead letter', () => {
    // O padrão é `ar.*`: fatos do produtor que não são de título chegam aqui.
    const r = toExternalTitle(envelope({ eventType: 'ar.period.closed', payload: {} }));
    assert.equal(r.kind, 'ignore');
  });

  test('campo a campo: sem referência, sem data, sem valor, sem moeda — ignora com razão', () => {
    for (const [campo, valor] of [
      ['externalRef', '  '],
      ['dueDate', '01/07/2026'],
      ['amountCents', -5],
      ['currency', 'reais'],
      ['status', 'flutuando'],
    ] as const) {
      const p = { ...(envelope().payload as Record<string, unknown>), [campo]: valor };
      const r = toExternalTitle(envelope({ payload: p }));
      assert.equal(r.kind, 'ignore', `${campo}=${String(valor)} deveria ser ignorado`);
    }
  });

  test('envelope sem produtor é ignorado — origem desconhecida não entra', () => {
    const r = toExternalTitle(envelope({ producedBy: '' as never }));
    assert.equal(r.kind, 'ignore');
    if (r.kind === 'ignore') assert.match(r.reason, /produtor/);
  });

  test('recebido ausente ou quebrado vira 0 — nunca inventa recebimento', () => {
    const p = { ...(envelope().payload as Record<string, unknown>) };
    delete p.receivedAmountCents;
    const r = toExternalTitle(envelope({ payload: p }));
    assert.equal(r.kind, 'apply');
    if (r.kind === 'apply') assert.equal(r.title.receivedAmountCents, 0);
  });

  test('⭐ recebido MAIOR que o valor passa — a divergência do produtor é respeitada', () => {
    const p = { ...(envelope().payload as Record<string, unknown>), receivedAmountCents: 150000, status: 'received' };
    const r = toExternalTitle(envelope({ payload: p }));
    assert.equal(r.kind, 'apply');
  });
});

describe('o handler entrega para a porta', () => {
  test('aplica o traduzido e devolve o efeito', async () => {
    const gravados: ExternalTitle[] = [];
    const handler = handleDunTitle({
      async recordExternalReceivable(title) {
        gravados.push(title);
        return 'created';
      },
    });

    const r = await handler(envelope());
    assert.deepEqual(r, { kind: 'projected', effect: 'created' });
    assert.equal(gravados.length, 1);
    assert.equal(gravados[0]!.sourceModuleId, 'ar');
  });

  test('o ignorado NÃO chega à porta', async () => {
    let chamadas = 0;
    const handler = handleDunTitle({
      async recordExternalReceivable() {
        chamadas++;
        return 'created';
      },
    });

    const r = await handler(envelope({ eventType: 'ar.period.closed', payload: {} }));
    assert.equal(r.kind, 'ignored');
    assert.equal(chamadas, 0);
  });
});

describe('as constantes do contrato', () => {
  test('o padrão é curinga do produtor e o consumidor tem nome próprio', () => {
    assert.equal(CONSUMED_EVENT_PATTERN, 'ar.*');
    assert.equal(CONSUMER_ID, 'dun-title-projection');
    assert.equal(CONSUMED_EVENT_TYPES.length, 3);
  });
});
