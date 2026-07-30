/**
 * Tipos do Módulo 36 — Avaliação de Desempenho.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⚠️ `perf` não é `goal`: aqui há DOIS papéis — quem avalia (`reviewerId`,
 * carimbado pelo servidor) e quem é avaliado (`revieweeId` + `revieweeName`,
 * ID SOLTO ao `hr`). Nenhum dado sensível (CPF, saúde, banco) existe aqui.
 *
 * @see supabase/migrations/0051_perf.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-PERF-SPEC.md — o fluxo de negócio
 */

export type CycleStatus = 'open' | 'closed';

export interface Cycle {
  readonly id: string;
  readonly name: string;
  readonly status: CycleStatus;
  readonly closedAt: string | null;
}

export interface NewCycleInput {
  readonly name?: unknown;
}

export interface Review {
  readonly id: string;
  readonly cycleId: string;
  /** ID SOLTO ao hr — sem FK cruzada. */
  readonly revieweeId: string;
  /** Carimbado pela tela no momento do registro. */
  readonly revieweeName: string;
  /** Carimbado pelo SERVIDOR (auth.uid()) — nunca do formulário. */
  readonly reviewerId: string | null;
  /** Nota OPCIONAL, escala 0–100. */
  readonly rating: number | null;
  readonly summary: string;
  readonly recordedAt: string;
}

export interface NewReviewInput {
  readonly cycleId?: unknown;
  readonly revieweeId?: unknown;
  readonly revieweeName?: unknown;
  readonly rating?: unknown;
  readonly summary?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
