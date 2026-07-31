/**
 * Tipos puros do Módulo 82 — Assinatura de Energia.
 *
 * Nem banco, nem rede, nem relógio, nem UI: só o vínculo comercial. O consumidor
 * assina uma FATIA (percentual) da geração de uma usina: quem assina (o cliente,
 * por id solto ao crm), o que assina (a usina, por id solto ao plant) e QUANTO da
 * geração dela fica alocado (`allocationPercent`, 0 < x <= 100). NASCE ATIVA (sem
 * pending — o intermediário seria viés de UMA distribuidora). O ciclo é
 * `active → cancelled` TERMINAL (a física do proj — quem re-assina negocia OUTRA
 * fatia; o DIVERGE consciente do catalog).
 *
 * @see supabase/migrations/0097_subscription.sql
 * @see docs/canon/MODULO-SUBSCRIPTION-SPEC.md
 */

/** O ciclo da assinatura: `active → cancelled` TERMINAL (a física do proj). */
export type SubscriptionStatus = 'active' | 'cancelled';

/** Uma assinatura de energia: a fatia da geração de uma usina alocada a um cliente. */
export interface Subscription {
  readonly id: string;
  /** ⭐ O cliente por ID SOLTO ao crm — OBRIGATÓRIO (não há assinatura sem assinante). */
  readonly customerId: string;
  /** Nome do cliente carimbado pela tela — OPCIONAL. `''` quando ausente. */
  readonly customerName: string;
  /** ⭐ A usina por ID SOLTO ao plant — OBRIGATÓRIO (não há fatia sem usina). */
  readonly plantId: string;
  /** Nome da usina carimbado pela tela — OPCIONAL. `''` quando ausente. */
  readonly plantName: string;
  /** ⭐ A fatia da geração: 0 < x <= 100 (zero não é assinatura; acima de 100 não existe). */
  readonly allocationPercent: number;
  readonly status: SubscriptionStatus;
  /** A razão do cancelamento — obrigatória APENAS ao cancelar. `''` enquanto ativa. */
  readonly cancelReason: string;
}

/** A entrada crua de uma assinatura nova — nasce sempre `active`. */
export interface NewSubscriptionInput {
  readonly customerId?: unknown;
  readonly customerName?: unknown;
  readonly plantId?: unknown;
  readonly plantName?: unknown;
  readonly allocationPercent?: unknown;
}

/** Um resumo contável da carteira de assinaturas. */
export interface SubscriptionSummary {
  readonly total: number;
  readonly active: number;
  readonly cancelled: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
