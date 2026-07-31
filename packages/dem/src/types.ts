/**
 * Tipos puros do Módulo 48 — Planejamento de Demanda.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o
 * plano de demanda, as linhas planejadas, e o ciclo de vida (publicar CONGELA
 * as linhas; published é terminal).
 *
 * O plano reusa a IDENTIDADE do `rfq`/`quote` (o documento que congela ao
 * publicar), com um DIVERGE assinado: aqui `published` é TERMINAL — não há um
 * segundo ato (nada de "awarded"). O próximo período é plano novo (a física do
 * `bud`).
 *
 * @see supabase/migrations/0063_dem.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-DEM-SPEC.md — o fluxo de negócio
 */

/**
 * O estado de um plano de demanda.
 *
 * ⭐ `published` e `cancelled` são TERMINAIS. O DIVERGE do `rfq`: a RFQ tem um
 * segundo ato depois de enviar (`open→awarded`); o plano não — publicar encerra.
 */
export type PlanStatus = 'draft' | 'published' | 'cancelled';

/** Uma linha planejada — TEXTO LIVRE, sem catálogo (o molde do `rfq`). */
export interface PlanLine {
  readonly lineNo: number;
  readonly product: string;
  /** Quantidade planejada (> 0). */
  readonly quantity: number;
  /** Unidade em texto livre ("kg", "un", "cx"). Opcional — pode ser vazia. */
  readonly unit: string;
}

/**
 * Um plano de demanda. O período é TEXTO LIVRE (o horizonte é dado do tenant).
 * Campos carimbados pelo servidor nascem vazios/nulos.
 */
export interface Plan {
  readonly id: string;
  /** O horizonte de planejamento em texto livre ("Q1 2027", "Março/2027"). */
  readonly period: string;
  readonly title: string;
  readonly status: PlanStatus;
  /** Razão do cancelamento. Vazia fora de `cancelled`. */
  readonly cancelReason: string;
  readonly lines: readonly PlanLine[];
}

export interface NewPlanLineInput {
  readonly product?: unknown;
  readonly quantity?: unknown;
  readonly unit?: unknown;
}

export interface NewPlanInput {
  readonly period?: unknown;
  readonly title?: unknown;
  readonly lines?: unknown;
}

/** Um resumo contável dos planos. Todo número é `.length`, nunca chute. */
export interface PlanSummary {
  readonly total: number;
  readonly draft: number;
  readonly published: number;
  readonly cancelled: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
