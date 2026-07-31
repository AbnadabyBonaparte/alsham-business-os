/**
 * Tipos puros do Módulo 80 — Continuidade de Negócios.
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o PLANO de
 * continuidade (BCP/DRP) e o LIVRO DE DRILLS que prova que o plano funciona.
 *
 * ⭐ O RECORTE: um plano de continuidade tem duas partes — o DOCUMENTO (o texto
 * do plano, com procedimentos) e a PRÁTICA (os testes/drills periódicos). O
 * DOCUMENTO detalhado é o `pol` (Política: documento versionado com ciência) e
 * fica DECLARADO FORA. O que JUSTIFICA este módulo é a PRÁTICA: o plano com
 * seus alvos (RTO/RPO) + o livro imutável de drills. Um plano que nunca foi
 * testado é papel; o valor está no registro dos testes.
 *
 * @see supabase/migrations/0095_continuity.sql
 * @see docs/canon/MODULO-CONTINUITY-SPEC.md
 */

/** O ciclo de vida do plano. `active ↔ archived` (a física do vendor). */
export type PlanStatus = 'active' | 'archived';

/**
 * Um plano de continuidade cadastrado. Campos carimbados pelo servidor nascem
 * vazios.
 */
export interface ContinuityPlan {
  readonly id: string;
  readonly name: string;
  /** O escopo do plano — TEXTO LIVRE. Pode ser vazio. */
  readonly scope: string;
  /**
   * ⭐ RTO (Recovery Time Objective) em TEXTO LIVRE ("4 horas", "1 dia útil"):
   * a forma como cada casa expressa o alvo é vocabulário dela. Pode ser vazio.
   */
  readonly rto: string;
  /**
   * ⭐ RPO (Recovery Point Objective) em TEXTO LIVRE ("última transação
   * confirmada", "backup da meia-noite"). Pode ser vazio.
   */
  readonly rpo: string;
  readonly status: PlanStatus;
}

/**
 * Um drill (teste do plano) — LANÇAMENTO IMUTÁVEL. Cada teste é um FATO
 * CONSUMADO (data, cenário, desfecho, nota). A evidência de que o plano foi
 * exercitado não se rasura — corrigir é registrar outro.
 */
export interface ContinuityDrill {
  readonly id: string;
  /** ID SOLTO ao plano exercitado — obrigatório. */
  readonly planId: string;
  /** O dia em que o drill aconteceu — `YYYY-MM-DD`, obrigatório. */
  readonly drilledOn: string;
  /** O cenário testado — TEXTO LIVRE, obrigatório. */
  readonly scenario: string;
  /** O desfecho do teste — TEXTO LIVRE, obrigatório. */
  readonly outcome: string;
  /** Observação livre — OPCIONAL. Pode ser vazio. */
  readonly note: string;
}

/** A entrada crua de um plano novo — os campos vêm do formulário. */
export interface NewPlanInput {
  readonly name?: unknown;
  readonly scope?: unknown;
  readonly rto?: unknown;
  readonly rpo?: unknown;
}

/** A entrada crua de um drill novo — os campos vêm do formulário. */
export interface NewDrillInput {
  readonly planId?: unknown;
  readonly drilledOn?: unknown;
  readonly scenario?: unknown;
  readonly outcome?: unknown;
  readonly note?: unknown;
}

/** Um resumo contável dos planos. Todo número é `.length`, nunca chute. */
export interface PlanSummary {
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
