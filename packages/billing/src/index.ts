/**
 * `@alsham/billing` — **contabilidade de uso**.
 *
 * ⚠️ **Não há preço aqui, e é de propósito (Lei 7).** Este pacote conta uso;
 * dinheiro é decisão do dono, com números que ele mede. Enquanto não
 * existirem, escrever qualquer um seria inventar promessa.
 *
 * Minerado de `usage_ledger` + `plan_limits` do kraken-v2 (**PROVADO**).
 *
 * ⭐ Zero I/O: gravação entra por `UsageRecorder`, relógio entra por
 * parâmetro. Quem tem `service_role` é a composição, nunca esta lógica.
 */

export {
  METRICS,
  USAGE_WARNING_RATIO,
  checkLimit,
  usageBand,
  periodOf,
  findLimit,
  usedInPeriod,
  eventUsageHook,
} from './usage.ts';

export type {
  LimitVerdict,
  Metric,
  PlanLimit,
  UsageBand,
  UsageEntry,
  UsageRecorder,
} from './usage.ts';
