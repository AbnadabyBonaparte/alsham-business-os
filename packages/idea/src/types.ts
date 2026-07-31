/**
 * Tipos puros do Módulo 68 — Ideias & Pipeline de Inovação.
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: as etapas do funil e
 * as ideias que andam por elas.
 *
 * ⭐⭐ O DIVERGE do `kanban`: NÃO há `projectId` obrigatório aqui — a ideia
 * existe por si. O único elo com projeto é o `promotedProjectId`, o DESTINO
 * quando a ideia é promovida.
 *
 * @see supabase/migrations/0083_idea.sql
 * @see docs/canon/MODULO-IDEA-SPEC.md
 */

/**
 * O ciclo da ideia: `active` (viva no funil) → `promoted` (virou projeto,
 * terminal) / `archived` (descartada, reversível para `active`).
 */
export type IdeaStatus = 'active' | 'promoted' | 'archived';

/** Uma etapa do funil — desenho do tenant, sem project_id (o DIVERGE do kanban). */
export interface IdeaStage {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}

/** Uma ideia. Campos carimbados pelo servidor nascem vazios. */
export interface Idea {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** A etapa onde a ideia está agora (FK intra-schema). */
  readonly currentStageId: string;
  readonly status: IdeaStatus;
  /** O projeto de destino, id solto — `null` até a promoção. */
  readonly promotedProjectId: string | null;
  readonly promotedProjectName: string;
}

/** A entrada crua de uma etapa nova. */
export interface NewStageInput {
  readonly name?: unknown;
  readonly position?: unknown;
}

/** A entrada crua de uma ideia nova. Nasce sempre `active`, numa etapa. */
export interface NewIdeaInput {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly currentStageId?: unknown;
}

/** Quantas ideias há em cada etapa — soma pura do funil. */
export interface StageLoad {
  readonly stageId: string;
  readonly count: number;
}

/** Um resumo contável do funil. Todo número é `.length`, nunca chute. */
export interface IdeaSummary {
  readonly total: number;
  readonly active: number;
  readonly promoted: number;
  readonly archived: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
