/**
 * Tipos puros do Módulo 58 — Scrum / Sprints.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o
 * sprint (a moldura temporal de um projeto) e o seu ciclo (planned → active →
 * closed, o último terminal).
 *
 * O sprint NÃO tem itens: os itens de trabalho são os cartões do `kanban`
 * (Módulo 55). Este módulo é só o time-box. Vínculo ao projeto por id solto.
 *
 * @see supabase/migrations/0073_scrum.sql
 * @see docs/canon/MODULO-SCRUM-SPEC.md
 */

/**
 * O estado de um sprint.
 *
 * ⭐ `closed` é TERMINAL (a física do `bud`/`proj`): o sprint encerrado não
 * reabre; o próximo é registro novo.
 */
export type SprintStatus = 'planned' | 'active' | 'closed';

/**
 * Um sprint. O projeto entra por id solto; campos carimbados pelo servidor
 * (activated/closed) nascem nulos.
 */
export interface Sprint {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly name: string;
  readonly goal: string;
  readonly status: SprintStatus;
  /** Datas em ISO (YYYY-MM-DD) ou vazias. */
  readonly startsOn: string;
  readonly endsOn: string;
}

export interface NewSprintInput {
  readonly projectId?: unknown;
  readonly projectName?: unknown;
  readonly name?: unknown;
  readonly goal?: unknown;
  readonly startsOn?: unknown;
  readonly endsOn?: unknown;
}

/** Um resumo contável dos sprints. Todo número é `.length`, nunca chute. */
export interface SprintSummary {
  readonly total: number;
  readonly planned: number;
  readonly active: number;
  readonly closed: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
