/**
 * Tipos puros do Módulo 54 — Cronogramas.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o
 * marco de um projeto e o seu ciclo de vida (planned → done/cancelled, com o
 * REABRIR done → planned).
 *
 * ⭐ O DIVERGE do `dem`/`bud` (cujo fim é terminal): aqui o `done` REABRE — um
 * marco concluído por engano é correção de rota, não um período contábil
 * fechado. `cancelled` é TERMINAL.
 *
 * @see supabase/migrations/0069_sched.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-SCHED-SPEC.md — o fluxo de negócio
 */

/**
 * O estado de um marco do cronograma.
 *
 * ⭐ `done` REABRE (`done → planned`): a física do `ops`, o DIVERGE do `dem`/`bud`.
 * `cancelled` é TERMINAL: o marco abandonado não volta.
 */
export type MilestoneStatus = 'planned' | 'done' | 'cancelled';

/**
 * Um marco. Título em texto livre; o projeto entra por id solto + nome carimbado
 * pela tela; a data prevista é opcional; os carimbos de conclusão (done) nascem
 * nulos e voltam a nulos ao reabrir.
 */
export interface Milestone {
  readonly id: string;
  /** Id solto ao projeto do `proj` — sem FK. Congela na criação. */
  readonly projectId: string;
  /** Nome do projeto carimbado pela tela — sobrevive ao redesenho do cadastro. */
  readonly projectName: string;
  readonly title: string;
  /** Data prevista — opcional (nem todo marco tem data cravada). */
  readonly dueOn: string | null;
  readonly status: MilestoneStatus;
  /** Razão do cancelamento — obrigatória em `cancelled`, vazia fora dele. */
  readonly cancelReason: string;
}

export interface NewMilestoneInput {
  readonly projectId?: unknown;
  readonly projectName?: unknown;
  readonly title?: unknown;
  readonly dueOn?: unknown;
}

/** Um resumo contável dos marcos. Todo número é `.length`, nunca chute. */
export interface MilestoneSummary {
  readonly total: number;
  readonly planned: number;
  readonly done: number;
  readonly cancelled: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
