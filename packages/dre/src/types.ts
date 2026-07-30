/**
 * Tipos do Módulo 32 — DRE Gerencial.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⛔ Gerencial, NÃO fiscal (Lei 3). O plano de linhas é desenho do tenant; os
 * valores nascem dos livros do cash e do cc, projetados por evento; totais são
 * views; linha sem lançamento não aparece.
 *
 * @see supabase/migrations/0047_dre.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-DRE-SPEC.md — o fluxo de negócio
 */

export type LineStatus = 'active' | 'archived';

/** A natureza é física contábil: receita soma, custo e despesa subtraem. */
export type LineKind = 'revenue' | 'cost' | 'expense';

export interface DreLine {
  readonly id: string;
  readonly name: string;
  readonly kind: LineKind;
  readonly matchCategory: string;
  readonly position: number;
  readonly currency: string;
  readonly status: LineStatus;
}

/** Uma linha do demonstrativo com valor — SEMPRE calculada da view. */
export interface StatementRow {
  readonly lineId: string;
  readonly lineName: string;
  readonly kind: LineKind;
  readonly position: number;
  readonly currency: string;
  readonly competenceMonth: string;
  readonly amountCents: number;
  readonly entryCount: number;
}

/** O resultado do período — SEMPRE calculado, nunca guardado. */
export interface DreResult {
  readonly currency: string;
  readonly competenceMonth: string;
  readonly revenueCents: number;
  readonly costCents: number;
  readonly expenseCents: number;
  readonly resultCents: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
