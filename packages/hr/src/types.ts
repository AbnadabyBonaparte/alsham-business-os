/**
 * Tipos do Módulo 33 — Cadastro de Colaboradores.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⚠️ Dado de pessoa física: o NOME é neutro (texto livre). Nenhum CPF, dado
 * de saúde ou bancário existe aqui — Folha e Benefícios estão DECLARADOS FORA
 * (spec §5).
 *
 * @see supabase/migrations/0048_hr.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-HR-SPEC.md — o fluxo de negócio
 */

export type EmployeeStatus = 'active' | 'on_leave' | 'terminated';

export interface Employee {
  readonly id: string;
  readonly fullName: string;
  /** Cargo TEXTO LIVRE — o organograma é de cada empresa. */
  readonly roleTitle: string;
  readonly department: string;
  readonly hiredOn: string;
  readonly status: EmployeeStatus;
  /** O ato do desligamento — do servidor. Terminal. */
  readonly terminationReason: string;
  /** Vínculo SOLTO ao registro anterior de quem retornou (id solto, sem FK). */
  readonly previousEmployeeId: string | null;
}

export interface NewEmployeeInput {
  readonly fullName?: unknown;
  readonly roleTitle?: unknown;
  readonly department?: unknown;
  readonly hiredOn?: unknown;
  readonly previousEmployeeId?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
