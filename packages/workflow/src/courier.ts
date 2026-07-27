import type { EventEnvelope } from '@alsham/core';

import { isExhausted, nextAttemptAt } from './backoff.ts';
import type {
  CourierDeps,
  DeliveryOutcome,
  DeliveryReport,
  OutboxRecord,
  Subscription,
} from './types.ts';

/**
 * **O CORREIO DO CORE.**
 *
 * Sem ele, todo evento que um módulo emite fica preso em `pending` para
 * sempre, e o "Lego que conversa por eventos" não conversa. Esta função é a
 * peça que fecha o ciclo do CORE-SPEC §3, passo 5.
 *
 * ⭐ **Lógica pura, sem I/O direto.** Não abre conexão, não lê relógio, não
 * chama rede: tudo entra por `CourierDeps`. É o que a torna testável sem
 * banco — e é onde a Regra de Ouro se aplica a uma engine, não só a um
 * módulo.
 *
 * O que ele faz, por evento vencido:
 *
 * 1. acha quem escuta aquele tipo;
 * 2. para cada consumidor, **grava em `processed_events` ANTES de agir** —
 *    e é isso, não o handler, que garante a idempotência;
 * 3. entrega;
 * 4. sucesso → `delivered`; falha → `failed` com backoff; insistiu demais →
 *    `dead`, **sem apagar**.
 */
export async function deliverDue(deps: CourierDeps): Promise<DeliveryReport> {
  const { store, now, batchSize = 50 } = deps;
  const agora = now();
  const devidos = await store.claimDue(agora.toISOString(), batchSize);

  const outcomes: DeliveryOutcome[] = [];

  for (const record of devidos) {
    outcomes.push(await entregarUm(record, deps, agora));
  }

  return {
    picked: devidos.length,
    delivered: outcomes.filter((o) => o.result === 'delivered').length,
    retried: outcomes.filter((o) => o.result === 'retry').length,
    dead: outcomes.filter((o) => o.result === 'dead').length,
    skipped: outcomes.filter(
      (o) => o.result === 'no-subscriber' || o.result === 'already-processed',
    ).length,
    outcomes,
  };
}

/**
 * Casa o tipo do evento com a inscrição.
 *
 * Aceita exato (`recon.approval.decided`) ou prefixo (`recon.*`). O curinga
 * é só no fim — um curinga no meio faria um consumidor escutar coisa que não
 * sabe tratar.
 */
export function matches(subscription: Subscription, eventType: string): boolean {
  const padrao = subscription.eventType;
  if (padrao === '*') return true;
  if (padrao.endsWith('.*')) return eventType.startsWith(padrao.slice(0, -1));
  return padrao === eventType;
}

async function entregarUm(
  record: OutboxRecord,
  deps: CourierDeps,
  agora: Date,
): Promise<DeliveryOutcome> {
  const { store, subscriptions, onDelivered } = deps;
  const envelope = record.envelope as EventEnvelope;
  const eventId = envelope.eventId;

  const interessados = subscriptions.filter((s) => matches(s, envelope.eventType));

  // Ninguém escuta. Não é erro — é o Lego funcionando sem o outro lado
  // (CORE-SPEC §3.1). O evento é marcado como entregue para não ficar
  // batendo na caixa para sempre; o fato continua registrado.
  if (interessados.length === 0) {
    await store.markDelivered(eventId);
    return { eventId, result: 'no-subscriber' };
  }

  let entregues = 0;
  let jaProcessados = 0;

  try {
    for (const sub of interessados) {
      // ⭐ A IDEMPOTÊNCIA MORA AQUI, e não no handler.
      //
      // A gravação vem ANTES de agir. Se o mesmo evento voltar — reentrega,
      // retry, replay —, o `unique (event_id, consumer)` recusa e o handler
      // simplesmente não é chamado de novo.
      //
      // A PK é composta de propósito: o mesmo evento DEVE ser tratado uma vez
      // POR CONSUMIDOR. Chave só em `event_id` faria o segundo consumidor
      // achar que já foi tratado — e perder o fato em silêncio.
      const inedito = await store.markProcessed({
        eventId,
        consumer: sub.consumer,
        tenantId: envelope.tenantId,
      });

      if (!inedito) {
        jaProcessados += 1;
        continue;
      }

      await sub.handle(envelope);
      entregues += 1;
    }
  } catch (err) {
    return await falhar(record, deps, agora, err);
  }

  await store.markDelivered(eventId);

  if (entregues === 0 && jaProcessados > 0) {
    return { eventId, result: 'already-processed' };
  }

  // A cobrança entra aqui — e só aqui. O correio não conhece billing: chama
  // um gancho que a composição ligou. Se billing sumir, o correio continua.
  if (onDelivered) {
    await onDelivered({
      tenantId: envelope.tenantId,
      eventId,
      eventType: envelope.eventType,
      producedBy: envelope.producedBy,
    });
  }

  return { eventId, result: 'delivered', consumers: entregues };
}

async function falhar(
  record: OutboxRecord,
  deps: CourierDeps,
  agora: Date,
  err: unknown,
): Promise<DeliveryOutcome> {
  const { store, policy } = deps;
  const eventId = record.envelope.eventId;
  const attempts = record.attempts + 1;
  const error = err instanceof Error ? err.message : String(err);

  if (isExhausted(attempts, policy)) {
    // Desiste de entregar, **não** de guardar. A linha fica com o erro para
    // alguém olhar — que é o oposto de perder o evento.
    await store.markDead({ eventId, attempts, lastError: error });
    return { eventId, result: 'dead', attempts, error };
  }

  const proxima = nextAttemptAt(agora, attempts, policy);
  await store.markFailed({ eventId, attempts, nextAttemptAt: proxima, lastError: error });
  return { eventId, result: 'retry', attempts, nextAttemptAt: proxima, error };
}
