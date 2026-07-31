/**
 * Tipos puros do Módulo 56 — Recursos / Alocação.
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a alocação de um
 * recurso a um projeto (em PERCENTUAL de capacidade) e o seu ciclo de vida (a
 * linha de planejamento que volta).
 */

/** O ciclo de vida da alocação. `active ↔ archived` (a física do vendor/dc). */
export type AllocationStatus = 'active' | 'archived';

/** Uma alocação de recurso a projeto. Campos do servidor nascem vazios. */
export interface Allocation {
  readonly id: string;
  /** O projeto do módulo proj — id SOLTO, obrigatório. */
  readonly projectId: string;
  /** O nome do projeto, carimbado pela tela (sobrevive ao redesenho do outro). */
  readonly projectName: string;
  /** O recurso — TEXTO LIVRE (pode ser terceiro/freelancer sem cadastro). */
  readonly resourceName: string;
  /** O colaborador do módulo hr — id SOLTO, OPCIONAL (nem toda alocação tem). */
  readonly employeeId: string | null;
  /** ⭐ PERCENTUAL de capacidade, não horas: 0 < pct <= 100. */
  readonly allocationPct: number;
  readonly startsOn: string | null;
  readonly endsOn: string | null;
  readonly status: AllocationStatus;
}

/** A entrada crua de uma alocação nova — os campos vêm do formulário. */
export interface NewAllocationInput {
  readonly projectId?: unknown;
  readonly projectName?: unknown;
  readonly resourceName?: unknown;
  readonly employeeId?: unknown;
  readonly allocationPct?: unknown;
  readonly startsOn?: unknown;
  readonly endsOn?: unknown;
}

/** Um resumo contável do plano. Todo número é `.length`, nunca chute. */
export interface AllocationSummary {
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
