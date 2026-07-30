/**
 * Tipos do Módulo 29 — Orçamentos.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * Ativar congela a trave (categoria, período, teto — a física do goal no
 * dinheiro); o realizado é a soma do livro do cash, projetada por evento —
 * calculado, nunca coluna; o período fechado é terminal.
 *
 * @see supabase/migrations/0044_bud.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-BUD-SPEC.md — o fluxo de negócio
 */

export type BudgetStatus = 'draft' | 'active' | 'closed';

export interface Budget {
  readonly id: string;
  readonly name: string;
  /** A categoria é O dado — a chave que casa com o cash. */
  readonly category: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly limitCents: number;
  readonly currency: string;
  readonly status: BudgetStatus;
}

/** O realizado e o saldo — SEMPRE calculados, nunca guardados. */
export interface BudgetRealized {
  readonly realizedCents: number;
  readonly remainingCents: number;
  readonly movementCount: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
