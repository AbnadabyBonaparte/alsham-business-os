/**
 * Tipos do Módulo 31 — Investimentos.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * O investimento é dado do tenant e volta do arquivo; o livro de atos
 * (aplicação, rendimento, resgate) é imutável; a posição é a soma dos atos —
 * sem cotação de mercado; resgatar mais que a posição é recusado.
 *
 * @see supabase/migrations/0046_invest.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-INVEST-SPEC.md — o fluxo de negócio
 */

export type HoldingStatus = 'active' | 'archived';

export type MovementKind = 'application' | 'yield' | 'redemption';

export interface Holding {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly institution: string;
  readonly currency: string;
  readonly status: HoldingStatus;
}

export interface Movement {
  readonly id: string;
  readonly holdingId: string;
  readonly kind: MovementKind;
  readonly amountCents: number;
  readonly signedAmountCents: number;
  readonly currency: string;
  readonly note: string;
  readonly externalRef: string | null;
  readonly occurredOn: string;
}

/** A posição por investimento — SEMPRE calculada, nunca guardada; sem cotação. */
export interface Position {
  readonly holdingId: string;
  readonly holdingName: string;
  readonly currency: string;
  readonly positionCents: number;
  readonly investedCents: number;
  readonly yieldCents: number;
  readonly redeemedCents: number;
  readonly movementCount: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
