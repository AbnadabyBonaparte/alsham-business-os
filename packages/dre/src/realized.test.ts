import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { EventEnvelope } from '@alsham/core';

import {
  CASH_CONSUMED_EVENT_PATTERN,
  CC_CONSUMED_EVENT_PATTERN,
  CONSUMED_EVENT_TYPES,
  CONSUMER_ID,
  handleDreEntry,
  toDreEntry,
} from './realized.ts';
import type { DreEntry } from './realized.ts';

function base(over: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    eventId: '00000000-0000-4000-8000-000000000001',
    eventType: 'cash.entry.registered',
    eventVersion: 1,
    tenantId: '00000000-0000-4000-8000-0000000000aa',
    occurredAt: '2026-07-29T12:00:00Z',
    producedBy: 'cash',
    payload: {},
    ...over,
  };
}

const cashEnv = (over: Record<string, unknown> = {}) =>
  base({
    eventType: 'cash.entry.registered',
    producedBy: 'cash',
    payload: { entryId: 'E1', signedAmountCents: 250000, currency: 'BRL', categoryName: 'Vendas', occurredOn: '2026-07-15', ...over },
  });

const ccEnv = (over: Record<string, unknown> = {}) =>
  base({
    eventType: 'cc.rateio.executed',
    producedBy: 'cc',
    payload: { executionId: 'X1', ruleName: 'Rateio matriz', sourceName: 'Aluguel', totalCents: 60000, currency: 'BRL', competenceOn: '2026-07-01', ...over },
  });

describe('a tradução dos DOIS produtores', () => {
  test('cash.entry.registered vira entrada da DRE, com a origem do envelope', () => {
    const r = toDreEntry(cashEnv());
    assert.equal(r.kind, 'apply');
    if (r.kind === 'apply') {
      assert.equal(r.entry.sourceModuleId, 'cash', 'origem de producedBy');
      assert.equal(r.entry.sourceKind, 'cash');
      assert.equal(r.entry.categoryName, 'Vendas');
      assert.equal(r.entry.signedAmountCents, 250000);
      assert.equal(r.entry.externalRef, 'E1');
    }
  });

  test('⭐ cc.rateio.executed vira entrada NEGATIVA, pela origem do rateio', () => {
    const r = toDreEntry(ccEnv());
    assert.equal(r.kind, 'apply');
    if (r.kind === 'apply') {
      assert.equal(r.entry.sourceModuleId, 'cc');
      assert.equal(r.entry.sourceKind, 'cc-rateio');
      assert.equal(r.entry.categoryName, 'Aluguel');
      assert.equal(r.entry.signedAmountCents, -60000, 'o rateio distribui um custo — sinal negativo');
      assert.equal(r.entry.occurredOn, '2026-07-01', 'competência do rateio');
      assert.equal(r.entry.externalRef, 'X1');
    }
  });

  test('⭐ um segundo produtor do mesmo formato grava a origem DELE', () => {
    const r = toDreEntry(base({
      eventType: 'erp.entry.registered',
      producedBy: 'erp',
      payload: { entryId: 'Z1', signedAmountCents: 100, currency: 'BRL', categoryName: 'Vendas', occurredOn: '2026-07-15' },
    }));
    assert.equal(r.kind, 'apply');
    if (r.kind === 'apply') assert.equal(r.entry.sourceModuleId, 'erp');
  });

  test('lançamento de caixa SEM categoria é ignorado', () => {
    const r = toDreEntry(cashEnv({ categoryName: undefined }));
    assert.equal(r.kind, 'ignore');
    if (r.kind === 'ignore') assert.match(r.reason, /categoria/);
  });

  test('rateio SEM origem nomeada é ignorado', () => {
    const r = toDreEntry(ccEnv({ sourceName: '  ' }));
    assert.equal(r.kind, 'ignore');
  });

  test('outro fato de qualquer um dos produtores é ignorado sem erro', () => {
    assert.equal(toDreEntry(base({ eventType: 'cash.category.registered', producedBy: 'cash', payload: {} })).kind, 'ignore');
    assert.equal(toDreEntry(base({ eventType: 'cc.rule.activated', producedBy: 'cc', payload: {} })).kind, 'ignore');
  });

  test('envelope sem produtor é ignorado', () => {
    const r = toDreEntry(base({ eventType: 'cash.entry.registered', producedBy: '' as never, payload: { entryId: 'E1', signedAmountCents: 1, currency: 'BRL', categoryName: 'X', occurredOn: '2026-07-15' } }));
    assert.equal(r.kind, 'ignore');
    if (r.kind === 'ignore') assert.match(r.reason, /produtor/);
  });
});

describe('o handler entrega para a porta', () => {
  test('aplica os dois tipos e devolve o efeito', async () => {
    const gravados: DreEntry[] = [];
    const handler = handleDreEntry({
      async recordExternalEntry(entry) {
        gravados.push(entry);
        return 'projected';
      },
    });

    assert.deepEqual(await handler(cashEnv()), { kind: 'projected', effect: 'projected' });
    assert.deepEqual(await handler(ccEnv()), { kind: 'projected', effect: 'projected' });
    assert.equal(gravados.length, 2);
    assert.deepEqual(gravados.map((g) => g.sourceKind).sort(), ['cash', 'cc-rateio']);
  });

  test('o ignorado NÃO chega à porta', async () => {
    let chamadas = 0;
    const handler = handleDreEntry({
      async recordExternalEntry() { chamadas++; return 'projected'; },
    });
    const r = await handler(base({ eventType: 'cash.category.registered', producedBy: 'cash', payload: {} }));
    assert.equal(r.kind, 'ignored');
    assert.equal(chamadas, 0);
  });
});

describe('as constantes do contrato', () => {
  test('os dois padrões e o consumidor têm nome próprio', () => {
    assert.equal(CASH_CONSUMED_EVENT_PATTERN, 'cash.*');
    assert.equal(CC_CONSUMED_EVENT_PATTERN, 'cc.*');
    assert.equal(CONSUMER_ID, 'dre-statement-projection');
    assert.deepEqual([...CONSUMED_EVENT_TYPES].sort(), ['cash.entry.registered', 'cc.rateio.executed']);
  });
});
