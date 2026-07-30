/**
 * Tipos do Módulo 30 — Contas Bancárias.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * A conta é dado do tenant e volta do arquivo; o livro por conta é imutável;
 * o saldo é a soma do livro (pode ser negativo — cheque especial); a
 * transferência é duas pernas ligadas por um transfer_id.
 *
 * @see supabase/migrations/0045_bank.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-BANK-SPEC.md — o fluxo de negócio
 */

export type AccountStatus = 'active' | 'archived';

export type MovementKind = 'in' | 'out' | 'adjustment';

export interface BankAccount {
  readonly id: string;
  readonly name: string;
  readonly bankName: string;
  readonly branch: string;
  readonly accountNumber: string;
  readonly currency: string;
  readonly status: AccountStatus;
}

export interface Movement {
  readonly id: string;
  readonly accountId: string;
  readonly kind: MovementKind;
  readonly amountCents: number;
  readonly signedAmountCents: number;
  readonly currency: string;
  readonly description: string;
  readonly reason: string;
  readonly counterpartyName: string;
  readonly externalRef: string | null;
  readonly transferId: string | null;
  readonly occurredOn: string;
}

/** O saldo por conta — SEMPRE calculado, nunca guardado; PODE ser negativo. */
export interface AccountBalance {
  readonly accountId: string;
  readonly accountName: string;
  readonly currency: string;
  readonly balanceCents: number;
  readonly inflowCents: number;
  readonly outflowCents: number;
  readonly movementCount: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
