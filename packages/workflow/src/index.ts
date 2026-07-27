/**
 * `@alsham/workflow` — **o correio do Core**.
 *
 * O motor de fila e reentrega da plataforma: pega o que está na caixa de
 * saída, entrega a quem escuta, e insiste com backoff quando falha.
 *
 * ⭐ **É ENGINE, não módulo** (Taxonomia §4). Encanamento da plataforma: não
 * aparece na Store, não se vende, não tem tenant dono. Serve todos os módulos
 * e não conhece nenhum.
 *
 * ⭐ **Zero I/O.** Persistência, relógio e destino entram por `CourierDeps`.
 * Quem tem `service_role` é a composição — nunca esta lógica, e **nunca** um
 * app cliente.
 *
 * @see docs/canon/CORE-SPEC.md §3.1 e §3.2 — por que caixa de saída, e por
 *      que a idempotência é por consumidor
 */

export { deliverDue, matches } from './courier.ts';
export {
  backoffDelayMs,
  nextAttemptAt,
  isExhausted,
  DEFAULT_RETRY_POLICY,
} from './backoff.ts';
export { auditSubscription, toAuditRecord } from './audit-handler.ts';

export type { AuditRecord, AuditWriter } from './audit-handler.ts';
export type {
  CourierDeps,
  DeliveryOutcome,
  DeliveryReport,
  EventHandler,
  OutboxRecord,
  OutboxStore,
  RetryPolicy,
  Subscription,
} from './types.ts';
