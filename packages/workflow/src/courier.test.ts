import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { EventEnvelope } from '@alsham/core';

import {
  DEFAULT_RETRY_POLICY,
  auditSubscription,
  backoffDelayMs,
  deliverDue,
  isExhausted,
  matches,
  toAuditRecord,
} from './index.ts';
import type {
  AuditRecord,
  OutboxRecord,
  OutboxStore,
  RetryPolicy,
  Subscription,
} from './index.ts';

/**
 * Testes do correio do Core.
 *
 * Nenhum banco, nenhuma rede, nenhum relógio — a lógica é pura, então o teste
 * é puro. O tempo é injetado, que é o que permite provar a curva de backoff
 * sem esperar uma hora.
 */

const TENANT_A = '00000000-0000-4000-8000-00000000000a';
const TENANT_B = '00000000-0000-4000-8000-00000000000b';

function envelope(over: Partial<EventEnvelope> = {}): EventEnvelope {
  return {
    eventId: 'evt-1',
    eventType: 'recon.reconciliation.completed',
    eventVersion: 1,
    tenantId: TENANT_A,
    occurredAt: '2026-07-27T10:00:00.000Z',
    producedBy: 'recon',
    payload: { statementId: 'stmt-1', unmatchedLines: 2 },
    ...over,
  };
}

function record(over: Partial<OutboxRecord> = {}): OutboxRecord {
  return {
    envelope: envelope(),
    status: 'pending',
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    ...over,
  };
}

/**
 * Um `OutboxStore` de memória que se comporta como o schema real:
 * `processed_events` tem chave composta `(event_id, consumer)` e recusa
 * repetição.
 */
function memoryStore(inicial: OutboxRecord[]) {
  const processed = new Set<string>();
  const log: string[] = [];
  const estado = new Map<string, { status: string; attempts: number; nextAttemptAt: string | null; lastError: string | null }>();

  const store: OutboxStore = {
    async claimDue(now, limit) {
      return inicial
        .filter((r) => {
          const st = estado.get(r.envelope.eventId);
          const status = st?.status ?? r.status;
          const proxima = st?.nextAttemptAt ?? r.nextAttemptAt;
          if (status !== 'pending' && status !== 'failed') return false;
          return proxima === null || proxima <= now;
        })
        .slice(0, limit)
        .map((r) => {
          const st = estado.get(r.envelope.eventId);
          return st ? { ...r, ...st } as OutboxRecord : r;
        });
    },
    async markDelivered(eventId) {
      estado.set(eventId, { status: 'delivered', attempts: estado.get(eventId)?.attempts ?? 0, nextAttemptAt: null, lastError: null });
      log.push(`delivered:${eventId}`);
    },
    async markFailed({ eventId, attempts, nextAttemptAt, lastError }) {
      estado.set(eventId, { status: 'failed', attempts, nextAttemptAt, lastError });
      log.push(`failed:${eventId}:${attempts}`);
    },
    async markDead({ eventId, attempts, lastError }) {
      estado.set(eventId, { status: 'dead', attempts, nextAttemptAt: null, lastError });
      log.push(`dead:${eventId}:${attempts}`);
    },
    async markProcessed({ eventId, consumer }) {
      const chave = `${eventId}::${consumer}`;
      if (processed.has(chave)) return false; // o unique do banco falando
      processed.add(chave);
      return true;
    },
    async unmarkProcessed({ eventId, consumer }) {
      processed.delete(`${eventId}::${consumer}`);
      log.push(`unprocessed:${eventId}:${consumer}`);
    },
  };

  return { store, processed, log, estado };
}

const AGORA = new Date('2026-07-27T12:00:00.000Z');

// ---------------------------------------------------------------------------

describe('casamento de inscrição', () => {
  const sub = (eventType: string): Subscription => ({
    consumer: 'c',
    eventType,
    handle: async () => {},
  });

  test('exato, prefixo e curinga total', () => {
    assert.ok(matches(sub('recon.approval.decided'), 'recon.approval.decided'));
    assert.ok(matches(sub('recon.*'), 'recon.approval.decided'));
    assert.ok(matches(sub('*'), 'qualquer.coisa.aqui'));
  });

  test('não casa o que não é dele', () => {
    assert.ok(!matches(sub('recon.approval.decided'), 'recon.statement.discarded'));
    assert.ok(!matches(sub('billing.*'), 'recon.approval.decided'));
  });
});

// ---------------------------------------------------------------------------

describe('⭐ IDEMPOTÊNCIA — o mesmo evento duas vezes, efeito uma vez', () => {
  test('a segunda rodada não chama o handler de novo', async () => {
    let chamadas = 0;
    const { store, processed } = memoryStore([record()]);
    const subs: Subscription[] = [
      { consumer: 'core-audit', eventType: '*', handle: async () => { chamadas += 1; } },
    ];

    const primeira = await deliverDue({
      store, subscriptions: subs, policy: DEFAULT_RETRY_POLICY, now: () => AGORA,
    });
    assert.equal(primeira.delivered, 1);
    assert.equal(chamadas, 1);

    // A caixa devolve o MESMO evento de novo — reentrega, retry ou replay.
    // É exatamente o cenário que derruba sistema sem idempotência.
    const store2 = { ...store, claimDue: async () => [record()] };
    const segunda = await deliverDue({
      store: store2, subscriptions: subs, policy: DEFAULT_RETRY_POLICY, now: () => AGORA,
    });

    assert.equal(chamadas, 1, 'O EFEITO ACONTECEU UMA VEZ SÓ');
    assert.equal(segunda.outcomes[0]?.result, 'already-processed');
    assert.equal(processed.size, 1);
  });

  test('a idempotência é POR CONSUMIDOR — dois consumidores, dois efeitos', async () => {
    // Chave só em event_id faria o segundo consumidor achar que já foi
    // tratado, e perder o fato em silêncio (CORE-SPEC §3.2).
    const vistos: string[] = [];
    const { store } = memoryStore([record()]);
    const subs: Subscription[] = [
      { consumer: 'core-audit', eventType: '*', handle: async () => { vistos.push('audit'); } },
      { consumer: 'relatorio', eventType: 'recon.*', handle: async () => { vistos.push('relatorio'); } },
    ];

    const r = await deliverDue({ store, subscriptions: subs, policy: DEFAULT_RETRY_POLICY, now: () => AGORA });
    assert.deepEqual(vistos, ['audit', 'relatorio']);
    assert.equal(r.outcomes[0]?.result === 'delivered' ? r.outcomes[0].consumers : 0, 2);
  });

  test('o registro vem ANTES de agir — e é DESFEITO quando o handler explode', async () => {
    const { store, processed } = memoryStore([record()]);
    const subs: Subscription[] = [
      { consumer: 'quebrado', eventType: '*', handle: async () => { throw new Error('caiu'); } },
    ];
    await deliverDue({ store, subscriptions: subs, policy: DEFAULT_RETRY_POLICY, now: () => AGORA });

    // ⚠️ ESTE TESTE MUDOU DE VEREDITO NA ETAPA 8, e a mudança é deliberada.
    //
    // Antes ele afirmava que o registro FICAVA, sob o argumento de que repetir
    // efeito colateral é pior do que não repetir (at-most-once por consumidor).
    // O argumento é bom, mas a implementação não entregava isso: com o
    // registro mantido, a reentrega via `already-processed`, chamava
    // `markDelivered` — e o evento cujo handler NUNCA teve sucesso era gravado
    // como entregue. Não era at-most-once; era perda silenciosa, e o backoff e
    // o `dead` viravam decoração inalcançável.
    //
    // Contra Postgres real: três rodadas, handler chamado UMA vez, evento
    // `delivered`. Ver `apps/api/src/outbox-store.test.ts`.
    //
    // A escolha agora é a do padrão outbox: **pelo menos uma vez, com
    // consumidor idempotente**. O resíduo aceito está documentado em
    // `OutboxStore.unmarkProcessed`: se o processo morrer ENTRE o registro e o
    // handler, aquele consumidor não é reexecutado.
    assert.equal(processed.size, 0, 'o registro tem de ser desfeito, senão o evento some em silêncio');
  });
});

// ---------------------------------------------------------------------------

describe('⭐ BACKOFF — attempts sobe, espera afasta, vira dead', () => {
  const POLICY: RetryPolicy = { baseDelayMs: 1_000, maxDelayMs: 60_000, maxAttempts: 4 };

  test('a curva dobra e respeita o teto', () => {
    assert.equal(backoffDelayMs(1, POLICY), 1_000);
    assert.equal(backoffDelayMs(2, POLICY), 2_000);
    assert.equal(backoffDelayMs(3, POLICY), 4_000);
    assert.equal(backoffDelayMs(7, POLICY), 60_000, 'sem teto, a espera viraria "nunca mais"');
    assert.equal(backoffDelayMs(99, POLICY), 60_000);
  });

  test('a cada falha, attempts sobe e o próximo horário se afasta', async () => {
    const esperas: string[] = [];
    let attempts = 0;

    for (let i = 0; i < 3; i += 1) {
      const { store, log } = memoryStore([record({ attempts, status: i === 0 ? 'pending' : 'failed' })]);
      const capturado: string[] = [];
      const espiao: OutboxStore = {
        ...store,
        async markFailed(input) {
          capturado.push(input.nextAttemptAt);
          await store.markFailed(input);
        },
      };
      const r = await deliverDue({
        store: espiao,
        subscriptions: [{ consumer: 'c', eventType: '*', handle: async () => { throw new Error('rede fora'); } }],
        policy: POLICY,
        now: () => AGORA,
      });
      const o = r.outcomes[0];
      assert.equal(o?.result, 'retry');
      attempts = o?.result === 'retry' ? o.attempts : attempts;
      esperas.push(capturado[0] as string);
      assert.ok(log.some((l) => l.startsWith('failed:')));
    }

    assert.deepEqual([1, 2, 3], [1, 2, 3]);
    assert.equal(attempts, 3, 'attempts subiu a cada rodada');
    assert.ok(esperas[0]! < esperas[1]!, 'a segunda espera é maior que a primeira');
    assert.ok(esperas[1]! < esperas[2]!, 'e a terceira, maior que a segunda');
  });

  test('esgotadas as tentativas, vira dead — e NÃO some', async () => {
    const { store, log, estado } = memoryStore([
      record({ attempts: POLICY.maxAttempts - 1, status: 'failed' }),
    ]);
    const r = await deliverDue({
      store,
      subscriptions: [{ consumer: 'c', eventType: '*', handle: async () => { throw new Error('sempre falha'); } }],
      policy: POLICY,
      now: () => AGORA,
    });

    assert.equal(r.dead, 1);
    const o = r.outcomes[0];
    assert.equal(o?.result, 'dead');
    assert.equal(o?.result === 'dead' ? o.attempts : 0, POLICY.maxAttempts);
    assert.ok(log.some((l) => l.startsWith('dead:')));
    // A linha continua na caixa, com o erro. Perder evento em silêncio é a
    // falha que a caixa de saída existe para impedir.
    assert.equal(estado.get('evt-1')?.lastError, 'sempre falha');
  });

  test('evento com next_attempt_at no futuro não é pego ainda', async () => {
    const { store } = memoryStore([
      record({ status: 'failed', attempts: 1, nextAttemptAt: '2026-07-27T13:00:00.000Z' }),
    ]);
    const r = await deliverDue({
      store, subscriptions: [{ consumer: 'c', eventType: '*', handle: async () => {} }],
      policy: POLICY, now: () => AGORA,
    });
    assert.equal(r.picked, 0);
  });

  test('isExhausted respeita o teto da política', () => {
    assert.ok(!isExhausted(3, POLICY));
    assert.ok(isExhausted(4, POLICY));
  });
});

// ---------------------------------------------------------------------------

describe('sem consumidor', () => {
  test('evento que ninguém escuta é marcado entregue, não fica batendo', async () => {
    const { store } = memoryStore([record()]);
    const r = await deliverDue({
      store, subscriptions: [], policy: DEFAULT_RETRY_POLICY, now: () => AGORA,
    });
    assert.equal(r.outcomes[0]?.result, 'no-subscriber');
    assert.equal(r.skipped, 1);
  });
});

// ---------------------------------------------------------------------------

describe('o consumidor de trilha', () => {
  test('traduz o envelope em entrada de auditoria, sem interpretar o payload', () => {
    const rec = toAuditRecord(envelope({ correlationId: 'corr-1' }));
    assert.equal(rec.tenantId, TENANT_A);
    assert.equal(rec.actorKind, 'system');
    assert.equal(rec.actorProcess, 'core-courier');
    assert.equal(rec.action, 'recon.reconciliation.completed');
    assert.equal(rec.resourceId, 'evt-1');
    assert.equal(rec.moduleId, 'recon');
    assert.deepEqual(rec.after.payload, { statementId: 'stmt-1', unmatchedLines: 2 });
  });

  test('ponta a ponta: módulo emite → caixa → correio → trilha', async () => {
    const trilha: AuditRecord[] = [];
    const { store } = memoryStore([record()]);

    const r = await deliverDue({
      store,
      subscriptions: [auditSubscription(async (rec) => { trilha.push(rec); })],
      policy: DEFAULT_RETRY_POLICY,
      now: () => AGORA,
    });

    assert.equal(r.delivered, 1);
    assert.equal(trilha.length, 1);
    assert.equal(trilha[0]?.action, 'recon.reconciliation.completed');
  });
});

// ---------------------------------------------------------------------------

describe('⭐ o correio encontra a cobrança', () => {
  test('cada evento entregue registra 1 unidade de uso, com o tenant certo', async () => {
    const usos: { tenantId: string; eventId: string }[] = [];
    const { store } = memoryStore([
      record({ envelope: envelope({ eventId: 'evt-a', tenantId: TENANT_A }) }),
      record({ envelope: envelope({ eventId: 'evt-b', tenantId: TENANT_B }) }),
    ]);

    await deliverDue({
      store,
      subscriptions: [{ consumer: 'core-audit', eventType: '*', handle: async () => {} }],
      policy: DEFAULT_RETRY_POLICY,
      now: () => AGORA,
      onDelivered: async ({ tenantId, eventId }) => { usos.push({ tenantId, eventId }); },
    });

    assert.deepEqual(usos, [
      { tenantId: TENANT_A, eventId: 'evt-a' },
      { tenantId: TENANT_B, eventId: 'evt-b' },
    ]);
  });

  test('evento que falhou NÃO conta uso — só o entregue conta', async () => {
    const usos: unknown[] = [];
    const { store } = memoryStore([record()]);
    await deliverDue({
      store,
      subscriptions: [{ consumer: 'c', eventType: '*', handle: async () => { throw new Error('x'); } }],
      policy: DEFAULT_RETRY_POLICY,
      now: () => AGORA,
      onDelivered: async () => { usos.push(1); },
    });
    assert.equal(usos.length, 0);
  });
});

// ---------------------------------------------------------------------------
// ⭐ O BURACO QUE O MOCK NÃO PEGAVA — descoberto contra Postgres na Etapa 8
// ---------------------------------------------------------------------------
//
// Até aqui, TODO teste deste arquivo usava um store novo por cenário. Nenhum
// exercitava o MESMO evento falhando e sendo reentregue — que é justamente
// onde `processed_events` acumula.
//
// Contra banco real, três rodadas seguidas deram: handler chamado UMA vez, e o
// evento gravado como `delivered`. Um evento cujo handler nunca teve sucesso,
// contado como entregue. O backoff e o `dead` eram decoração.
//
// Estes testes existem para que isso não volte.

describe('⭐ falha e reentrega no MESMO store — o handler tem de ser chamado de novo', () => {
  const POLICY: RetryPolicy = { baseDelayMs: 1_000, maxDelayMs: 60_000, maxAttempts: 3 };

  test('handler que lança é reexecutado na rodada seguinte', async () => {
    const { store, log } = memoryStore([record({})]);
    let chamadas = 0;
    const subs = [
      {
        consumer: 'c',
        eventType: '*',
        handle: async () => {
          chamadas += 1;
          throw new Error('falhou');
        },
      },
    ];

    await deliverDue({ store, subscriptions: subs, policy: POLICY, now: () => AGORA });
    assert.equal(chamadas, 1);
    assert.ok(log.some((l) => l.startsWith('unprocessed:')), 'o registro não foi desfeito');

    // Reentrega: o horário avançou além do backoff.
    const depois = new Date(AGORA.getTime() + 10 * 60_000);
    await deliverDue({ store, subscriptions: subs, policy: POLICY, now: () => depois });

    assert.equal(chamadas, 2, 'a reentrega não chamou o handler — o evento sumiria em silêncio');
  });

  test('e o evento NÃO é marcado como entregue enquanto ninguém o entregou', async () => {
    const { store, estado } = memoryStore([record({})]);
    const subs = [
      { consumer: 'c', eventType: '*', handle: async () => { throw new Error('falhou'); } },
    ];

    await deliverDue({ store, subscriptions: subs, policy: POLICY, now: () => AGORA });
    const depois = new Date(AGORA.getTime() + 10 * 60_000);
    await deliverDue({ store, subscriptions: subs, policy: POLICY, now: () => depois });

    assert.notEqual(
      estado.get('evt-1')?.status,
      'delivered',
      'evento com handler que nunca teve sucesso foi gravado como entregue',
    );
  });

  test('só o consumidor que lançou é desfeito — quem entregou não é chamado duas vezes', async () => {
    const { store } = memoryStore([record({})]);
    let bons = 0;
    let ruins = 0;
    const subs = [
      { consumer: 'bom', eventType: '*', handle: async () => { bons += 1; } },
      {
        consumer: 'ruim',
        eventType: '*',
        handle: async () => {
          ruins += 1;
          throw new Error('falhou');
        },
      },
    ];

    await deliverDue({ store, subscriptions: subs, policy: POLICY, now: () => AGORA });
    const depois = new Date(AGORA.getTime() + 10 * 60_000);
    await deliverDue({ store, subscriptions: subs, policy: POLICY, now: () => depois });

    assert.equal(bons, 1, 'o consumidor que já tinha entregue foi chamado de novo');
    assert.equal(ruins, 2, 'o consumidor que falhou não foi reexecutado');
  });

  test('depois de esgotar as tentativas o evento vira dead — de verdade, rodada a rodada', async () => {
    const { store, estado } = memoryStore([record({})]);
    const subs = [
      { consumer: 'c', eventType: '*', handle: async () => { throw new Error('sempre falha'); } },
    ];

    let t = AGORA.getTime();
    for (let i = 0; i < POLICY.maxAttempts; i++) {
      await deliverDue({ store, subscriptions: subs, policy: POLICY, now: () => new Date(t) });
      t += 60 * 60_000; // avança bem além de qualquer backoff
    }

    assert.equal(estado.get('evt-1')?.status, 'dead');
    assert.equal(estado.get('evt-1')?.lastError, 'sempre falha');
  });
});
