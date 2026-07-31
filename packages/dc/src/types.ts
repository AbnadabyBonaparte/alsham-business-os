/**
 * Tipos puros do Módulo 50 — Centros de Distribuição.
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o centro de
 * distribuição e o seu ciclo de vida (o ativo que volta a operar).
 */

/** O ciclo de vida do CD. `active ↔ archived` (o DIVERGE do hr). */
export type CenterStatus = 'active' | 'archived';

/** Um centro de distribuição cadastrado. Campos carimbados pelo servidor nascem vazios. */
export interface Center {
  readonly id: string;
  readonly name: string;
  /** Endereço TEXTO LIVRE — o lugar do CD. Pode ser vazio. */
  readonly address: string;
  readonly status: CenterStatus;
}

/** A entrada crua de um cadastro novo — os campos vêm do formulário. */
export interface NewCenterInput {
  readonly name?: unknown;
  readonly address?: unknown;
}

/** Um resumo contável do cadastro. Todo número é `.length`, nunca chute. */
export interface CenterSummary {
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
