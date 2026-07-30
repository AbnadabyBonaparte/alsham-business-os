/**
 * Tipos do Módulo 14 — Fluxo de Caixa.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * O caixa é o livro do `inv` no dinheiro: lançamentos imutáveis com o sinal
 * no TIPO, categoria como DADO DO TENANT (opcional — obrigar inventa dado),
 * e o saldo sempre calculado, nunca guardado. É CAIXA realizado: o futuro é
 * previsão, e previsão é Orçamento (capacidade futura declarada).
 *
 * @see supabase/migrations/0029_cash.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-CASH-SPEC.md — o fluxo de negócio
 */

export type EntryKind = 'in' | 'out' | 'adjustment';

export type CategoryStatus = 'active' | 'archived';

export interface Category {
  readonly id: string;
  readonly name: string;
  readonly status: CategoryStatus;
}

export interface Entry {
  readonly id: string;
  readonly kind: EntryKind;
  /** Positivo em entrada/saída; no ajuste pode ser negativo (nunca zero). */
  readonly amountCents: number;
  readonly currency: string;
  readonly description: string;
  /** Obrigatória no ajuste — a linha muda esconde o desvio. */
  readonly reason: string;
  /** Opcional — "sem categoria" é honesto; categoria inventada mente. */
  readonly categoryId: string | null;
  /** TEXTO LIVRE opcional. Multi-conta estruturada é capacidade futura. */
  readonly account: string | null;
  readonly externalRef: string | null;
  /** `AAAA-MM-DD` — o dia em que o dinheiro MOVEU. Nunca futuro. */
  readonly occurredOn: string;
}

export interface NewEntryInput {
  readonly kind?: unknown;
  readonly amountCents?: unknown;
  readonly currency?: unknown;
  readonly description?: unknown;
  readonly reason?: unknown;
  readonly categoryId?: unknown;
  readonly account?: unknown;
  readonly externalRef?: unknown;
  readonly occurredOn?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
