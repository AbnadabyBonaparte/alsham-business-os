import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { EventEnvelope } from '@alsham/core';

import {
  CONSUMED_EVENT_PATTERN,
  CONSUMED_EVENT_TYPES,
  CONSUMER_ID,
  handleBudMovement,
  toBudMovement,
} from './realized.ts';
import type { BudMovement } from './realized.ts';

function envelope(over: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    eventId: '00000000-0000-4000-8000-000000000001',
    eventType: 'cash.entry.registered',
    eventVersion: 1,
    tenantId: '00000000-0000-4000-8000-0000000000aa',
    occurredAt: '2026-07-29T12:00:00Z',
    producedBy: 'cash',
    payload: {
      entryId: 'ENTRY-0001',
      signedAmountCents: -25000,
      currency: 'BRL',
      categoryName: 'Marketing',
      occurredOn: '2026-07-15',
    },
    ...over,
  };
}

describe('a tradução do lançamento de caixa para o realizado', () => {
  test('o lançamento bom vira projeção, com a ORIGEM do envelope', () => {
    const r = toBudMovement(envelope());
    assert.equal(r.kind, 'apply');
    if (r.kind === 'apply') {
      assert.equal(r.movement.externalRef, 'ENTRY-0001');
      assert.equal(r.movement.sourceModuleId, 'cash', 'a origem vem de producedBy');
      assert.equal(r.movement.categoryName, 'Marketing');
      assert.equal(r.movement.signedAmountCents, -25000);
      assert.equal(r.movement.currency, 'BRL');
      assert.equal(r.movement.occurredOn, '2026-07-15');
    }
  });

  /**
   * ⭐ A prova de que a origem NÃO está chumbada: um produtor fictício
   * emitindo o MESMO formato grava a origem DELE.
   */
  test('⭐ um segundo produtor do mesmo formato grava a origem DELE', () => {
    const r = toBudMovement(
      envelope({ eventType: 'erp-bridge.entry.registered', producedBy: 'erp-bridge' }),
    );
    assert.equal(r.kind, 'apply');
    if (r.kind === 'apply') {
      assert.equal(r.movement.sourceModuleId, 'erp-bridge');
    }
  });

  test('payload de outro fato do produtor é IGNORADO sem erro — não enche dead letter', () => {
    // O padrão é `cash.*`: categoria criada/arquivada chega aqui também.
    const r = toBudMovement(envelope({ eventType: 'cash.category.registered', payload: {} }));
    assert.equal(r.kind, 'ignore');
  });

  /**
   * ⭐ A regra própria do bud: SEM categoria, não casa orçamento nenhum —
   * ignorado sem erro. Não é payload quebrado; é gasto que não se atribui.
   */
  test('⭐ lançamento SEM categoria é ignorado — não casa orçamento nenhum', () => {
    const p = { ...(envelope().payload as Record<string, unknown>) };
    delete p.categoryName;
    const r = toBudMovement(envelope({ payload: p }));
    assert.equal(r.kind, 'ignore');
    if (r.kind === 'ignore') assert.match(r.reason, /categoria/);
  });

  test('categoria em branco também é ignorada', () => {
    const p = { ...(envelope().payload as Record<string, unknown>), categoryName: '   ' };
    const r = toBudMovement(envelope({ payload: p }));
    assert.equal(r.kind, 'ignore');
  });

  test('campo a campo: sem id, sem moeda ISO, sem data ISO, sem valor inteiro — ignora com razão', () => {
    for (const [campo, valor] of [
      ['entryId', '  '],
      ['currency', 'reais'],
      ['occurredOn', '15/07/2026'],
      ['signedAmountCents', 1.5],
    ] as const) {
      const p = { ...(envelope().payload as Record<string, unknown>), [campo]: valor };
      const r = toBudMovement(envelope({ payload: p }));
      assert.equal(r.kind, 'ignore', `${campo}=${String(valor)} deveria ser ignorado`);
    }
  });

  test('envelope sem produtor é ignorado — origem desconhecida não entra', () => {
    const r = toBudMovement(envelope({ producedBy: '' as never }));
    assert.equal(r.kind, 'ignore');
    if (r.kind === 'ignore') assert.match(r.reason, /produtor/);
  });

  /**
   * ⭐ Entrada (crédito, sinal positivo) TAMBÉM é traduzida — a decisão de
   * contar só o desembolso mora na VIEW (soma só o negativo), não no
   * tradutor. O tradutor projeta o fato; o realizado é calculado.
   */
  test('⭐ crédito (positivo) também é projetado — quem filtra desembolso é a view', () => {
    const p = { ...(envelope().payload as Record<string, unknown>), signedAmountCents: 40000 };
    const r = toBudMovement(envelope({ payload: p }));
    assert.equal(r.kind, 'apply');
    if (r.kind === 'apply') assert.equal(r.movement.signedAmountCents, 40000);
  });
});

describe('o handler entrega para a porta', () => {
  test('aplica o traduzido e devolve o efeito', async () => {
    const gravados: BudMovement[] = [];
    const handler = handleBudMovement({
      async recordExternalMovement(movement) {
        gravados.push(movement);
        return 'projected';
      },
    });

    const r = await handler(envelope());
    assert.deepEqual(r, { kind: 'projected', effect: 'projected' });
    assert.equal(gravados.length, 1);
    assert.equal(gravados[0]!.sourceModuleId, 'cash');
  });

  test('o ignorado NÃO chega à porta', async () => {
    let chamadas = 0;
    const handler = handleBudMovement({
      async recordExternalMovement() {
        chamadas++;
        return 'projected';
      },
    });

    const r = await handler(envelope({ eventType: 'cash.category.registered', payload: {} }));
    assert.equal(r.kind, 'ignored');
    assert.equal(chamadas, 0);
  });
});

describe('as constantes do contrato', () => {
  test('o padrão é curinga do produtor e o consumidor tem nome próprio', () => {
    assert.equal(CONSUMED_EVENT_PATTERN, 'cash.*');
    assert.equal(CONSUMER_ID, 'bud-realized-projection');
    assert.equal(CONSUMED_EVENT_TYPES.length, 1);
    assert.equal(CONSUMED_EVENT_TYPES[0], 'cash.entry.registered');
  });
});
