/**
 * Tipos do Módulo 34 — Escalas.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐ A física do domínio: o mesmo COLABORADOR não roda dois turnos que se
 * cruzam — quem recusa de verdade é a EXCLUSION constraint do banco; o
 * pacote avisa antes, com a mesma régua (período meio-aberto). É a MESMA
 * física do `spc`, com outro DONO: lá é o espaço; aqui é a pessoa.
 *
 * ⚠️ `employeeId` é ID SOLTO (sem FK para `hr.employees`) e `employeeName`
 * é carimbado pela TELA no momento da escala — este módulo não lê o schema
 * `hr` (Lei do Lego §6).
 *
 * @see supabase/migrations/0049_shift.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-SHIFT-SPEC.md — o fluxo de negócio
 */

export type ScheduleStatus = 'scheduled' | 'cancelled';

export interface Schedule {
  readonly id: string;
  /** ID SOLTO ao colaborador — sem FK para hr.employees. */
  readonly employeeId: string;
  /** Nome carimbado pela TELA no momento da escala. */
  readonly employeeName: string;
  /** Turno TEXTO LIVRE — o vocabulário de escala é de cada empresa. */
  readonly shiftLabel: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly status: ScheduleStatus;
  /** O ato do cancelamento — do servidor. Terminal. */
  readonly cancelledAt: string | null;
  readonly cancelReason: string;
}

export interface NewScheduleInput {
  readonly employeeId?: unknown;
  readonly employeeName?: unknown;
  readonly shiftLabel?: unknown;
  readonly startsAt?: unknown;
  readonly endsAt?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
