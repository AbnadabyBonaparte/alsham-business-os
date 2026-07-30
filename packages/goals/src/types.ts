/**
 * Tipos do Módulo 23 — Metas.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * O alvo congela na ativação; o andamento é um livro de check-ins
 * imutáveis; o progresso vigente é o ÚLTIMO check-in — calculado, nunca
 * coluna. achieved/missed é decisão de gente: o alvo informa, o dono
 * decide.
 *
 * @see supabase/migrations/0038_goal.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-GOAL-SPEC.md — o fluxo de negócio
 */

export type GoalStatus = 'draft' | 'active' | 'achieved' | 'missed' | 'cancelled';

export interface Goal {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** ⭐ A métrica é TEXTO LIVRE — a unidade mora nela. */
  readonly metric: string;
  /** O alvo é opcional; quando é dinheiro, a moeda vem junto. */
  readonly targetValue: number | null;
  readonly currency: string | null;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly assigneeUserId: string | null;
  readonly status: GoalStatus;
  /** O ato do desfecho — do servidor. Terminal. */
  readonly decidedAt: string | null;
  readonly cancelReason: string;
}

/** Uma linha do livro do andamento — imutável, reportada por gente. */
export interface GoalCheckin {
  readonly id: string;
  readonly seq: number;
  readonly goalId: string;
  readonly reportedValue: number;
  readonly note: string;
  readonly reportedAt: string;
}

export interface NewGoalInput {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly metric?: unknown;
  readonly targetValue?: unknown;
  readonly currency?: unknown;
  readonly startsOn?: unknown;
  readonly endsOn?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
