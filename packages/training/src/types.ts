/**
 * Tipos do Módulo 35 — Treinamentos.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⚠️ Dado de pessoa: `traineeId` é ID SOLTO (sem FK cruzada — a Lei do
 * Lego) e `traineeName` é texto livre carimbado pela tela. Nenhum CPF, dado
 * de saúde ou bancário existe aqui. `grade` é texto livre OPCIONAL — o
 * método de avaliação é do tenant, nunca do produto.
 *
 * @see supabase/migrations/0050_train.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-TRAIN-SPEC.md — o fluxo de negócio
 */

export type ProgramStatus = 'active' | 'archived';

export interface Program {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: ProgramStatus;
}

export interface NewProgramInput {
  readonly name?: unknown;
  readonly description?: unknown;
}

export type SessionStatus = 'draft' | 'published' | 'concluded' | 'cancelled';

export interface Session {
  readonly id: string;
  readonly programId: string;
  readonly title: string;
  readonly startsAt: string;
  /** `null` = turma sem teto. */
  readonly capacity: number | null;
  readonly status: SessionStatus;
}

export interface NewSessionInput {
  readonly programId?: unknown;
  readonly title?: unknown;
  readonly startsAt?: unknown;
  readonly capacity?: unknown;
}

export type EnrollmentStatus = 'registered' | 'attended' | 'completed' | 'cancelled';

export interface Enrollment {
  readonly id: string;
  readonly sessionId: string;
  /** ID SOLTO — sem FK para hr.employees ou qualquer schema alheio. */
  readonly traineeId: string;
  /** Texto livre, carimbado pela tela no momento da inscrição. */
  readonly traineeName: string;
  readonly status: EnrollmentStatus;
  readonly attendedAt: string | null;
  readonly completedAt: string | null;
  /** Nota OPCIONAL, texto livre — o método de avaliação é do tenant. */
  readonly grade: string;
}

export interface NewEnrollmentInput {
  readonly sessionId?: unknown;
  readonly traineeId?: unknown;
  readonly traineeName?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
