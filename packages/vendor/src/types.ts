/**
 * Tipos puros do Módulo 43 — Fornecedores.
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o fornecedor e o seu
 * ciclo de vida (a relação comercial que volta).
 */

/** O ciclo de vida do fornecedor. `active ↔ archived` (o DIVERGE do hr). */
export type SupplierStatus = 'active' | 'archived';

/** Um fornecedor cadastrado. Campos carimbados pelo servidor nascem vazios. */
export interface Supplier {
  readonly id: string;
  readonly name: string;
  /** Segmento/categoria TEXTO LIVRE — vocabulário do tenant. Pode ser vazio. */
  readonly segment: string;
  readonly status: SupplierStatus;
}

/** A entrada crua de um cadastro novo — os campos vêm do formulário. */
export interface NewSupplierInput {
  readonly name?: unknown;
  readonly segment?: unknown;
}

/** Um resumo contável do cadastro. Todo número é `.length`, nunca chute. */
export interface SupplierSummary {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
