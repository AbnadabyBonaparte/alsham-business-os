/**
 * Tipos do Módulo 28 — Centros de Custo & Rateio.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * O centro é dado do tenant (volta do arquivo); a regra é desenho do tenant
 * que fecha 100% ao ativar (física); a execução gera lançamentos imutáveis
 * com a origem por id solto + nome carimbado.
 *
 * @see supabase/migrations/0043_cc.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-CC-SPEC.md — o fluxo de negócio
 */

export type CenterStatus = 'active' | 'archived';
export type RuleStatus = 'draft' | 'active' | 'archived';

export interface CostCenter {
  readonly id: string;
  readonly name: string;
  readonly status: CenterStatus;
}

export interface RuleLine {
  readonly centerId: string;
  /** Pontos-base: 10000 = 100,00%. */
  readonly basisPoints: number;
}

export interface AllocationRule {
  readonly id: string;
  readonly name: string;
  readonly status: RuleStatus;
  readonly lines: readonly RuleLine[];
}

export interface Allocation {
  readonly id: string;
  readonly executionId: string;
  readonly centerId: string;
  readonly centerName: string;
  readonly basisPoints: number;
  readonly amountCents: number;
}

export interface Execution {
  readonly id: string;
  readonly seq: number;
  readonly ruleId: string;
  readonly ruleName: string;
  readonly sourceKind: string;
  readonly sourceRef: string | null;
  readonly sourceName: string;
  readonly totalCents: number;
  readonly currency: string;
  readonly competenceOn: string;
  readonly note: string;
  readonly reason: string;
}

/** Uma parcela calculada do rateio — antes de virar linha no banco. */
export interface ComputedShare {
  readonly centerId: string;
  readonly basisPoints: number;
  readonly amountCents: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
