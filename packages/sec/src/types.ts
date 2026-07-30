/**
 * Tipos do Módulo 42 — Segurança / Rondas (Vertical Shopping Centers).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐⭐ A decisão de desenho: este módulo tem DUAS peças, com físicas opostas.
 *
 * O `Checkpoint` (posto de verificação) é DESENHO DO TENANT — texto livre,
 * volta do arquivo (física do `mall`/`spc`: o mesmo posto reaberto é o
 * mesmo posto).
 *
 * O `Patrol` (a ronda) é um ATO PONTUAL — nasce pronto, carimbado pelo
 * servidor, e NUNCA MUDA. Não tem `status`, não tem ciclo de vida: o
 * incidente (que teria ciclo, gravidade, desfecho) JÁ É uma Ocorrência
 * (`occ`, Módulo 16) — este módulo não o reescreve.
 *
 * @see supabase/migrations/0057_sec.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-SEC-SPEC.md — o fluxo de negócio
 */

export type CheckpointStatus = 'active' | 'archived';

export interface Checkpoint {
  readonly id: string;
  /** TEXTO LIVRE — o vocabulário de cada praça ("portaria sul", "doca 3"). */
  readonly name: string;
  /** `archived → active` existe: o posto é o LUGAR, e o lugar volta. */
  readonly status: CheckpointStatus;
}

export interface NewCheckpointInput {
  readonly name?: unknown;
}

/**
 * A ronda — ⭐⭐ SEM `status`, por desenho: não tem ciclo de vida, porque
 * não é um pedido que se resolve nem um fato que se apura (isso é o
 * `occ`) — é a passagem verificada, ato consumado desde o instante em que
 * nasce.
 */
export interface Patrol {
  readonly id: string;
  readonly checkpointId: string;
  readonly checkpointName: string;
  /** ⭐ Carimbado pelo SERVIDOR — a hora do formulário é descartada. */
  readonly passedAt: string;
  readonly note: string;
}

export interface NewPatrolInput {
  readonly checkpointId?: unknown;
  readonly note?: unknown;
}

export interface NewPatrol {
  readonly checkpointId: string;
  readonly note: string;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
