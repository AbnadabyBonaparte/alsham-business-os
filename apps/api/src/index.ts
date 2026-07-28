/**
 * `@alsham/api` — **a composição do Core**.
 *
 * ⭐ O único lugar do repositório onde os módulos se conhecem. Ele importa
 * todos; nenhum deles importa nenhum outro.
 *
 * ⛔ Roda com `service_role`, do servidor. Nunca num app cliente.
 */

export { runCourierOnce, buildSubscriptions, DEFAULT_POLICY } from './composition.ts';
export { createPgOutboxStore } from './outbox-store.ts';
export { createAuditWriter, createUsageRecorder, createSpendProjectionPort } from './adapters.ts';
export { readQueueHealth, judgeHealth } from './health.ts';
export type { QueueHealth } from './health.ts';
export { handleRequest } from './handler.ts';
export type { HandlerDeps, HandlerResult } from './handler.ts';
