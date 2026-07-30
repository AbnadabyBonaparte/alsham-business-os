import type {
  NewScheduleInput,
  Problem,
  Schedule,
  ScheduleStatus,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 34 — Escalas.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem recusa o conflito DE
 * VERDADE é a exclusion constraint do banco — o pacote avisa antes, com a
 * MESMA régua, para a recusa chegar com nome em vez de erro de constraint.
 */

/**
 * ⭐ Espelho de `shift.allowed_transition()` no `0049_shift.sql` — há teste
 * que lê a migration e compara. UM par só: cancelar é terminal — o período
 * já está livre, e quem precisa dele de novo escala de novo. Diferente do
 * `hr` (onde `on_leave ↔ active` existe): aqui não há "parar reversível".
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [ScheduleStatus, ScheduleStatus])[] = [
  ['scheduled', 'cancelled'],
];

export function canTransition(from: ScheduleStatus, to: ScheduleStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canCancel(status: ScheduleStatus): boolean {
  return canTransition(status, 'cancelled');
}

export function canEditSchedule(status: ScheduleStatus): boolean {
  return status === 'scheduled';
}

/**
 * ⭐ A régua do conflito — MEIO-ABERTO ([início, fim)): terminar às 12h e
 * começar às 12h convivem. É a mesma leitura do `tstzrange(a, b) &&` da
 * constraint, e há teste que garante as duas de acordo.
 */
export function overlaps(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** A primeira escala viva do MESMO colaborador que conflita — ou null. */
export function findConflict(
  employeeId: string,
  startsAt: string,
  endsAt: string,
  existing: readonly Schedule[],
  ignoreId?: string,
): Schedule | null {
  for (const s of existing) {
    if (s.status !== 'scheduled') continue;      // ⭐ a cancelada liberou o período.
    if (s.employeeId !== employeeId) continue;
    if (ignoreId !== undefined && s.id === ignoreId) continue;
    if (overlaps(startsAt, endsAt, s.startsAt, s.endsAt)) return s;
  }
  return null;
}

/** A recusa com nome — a mesma física da constraint, decidida aqui. */
export function whyCannotSchedule(
  employeeId: string,
  employeeName: string,
  shiftLabel: string,
  startsAt: string,
  endsAt: string,
  existing: readonly Schedule[],
): string | null {
  if (employeeId.trim().length === 0) {
    return 'Escolha o colaborador.';
  }
  if (employeeName.trim().length === 0) {
    return 'Informe o nome do colaborador.';
  }
  if (shiftLabel.trim().length === 0) {
    return 'Informe o turno.';
  }
  if (endsAt <= startsAt) {
    return 'O fim precisa vir depois do início — período vazio não escala ninguém.';
  }
  const conflito = findConflict(employeeId, startsAt, endsAt, existing);
  if (conflito !== null) {
    return `O período cruza com outra escala do mesmo colaborador (${conflito.shiftLabel}).`;
  }
  return null;
}

export function whyCannotCancel(schedule: Schedule, reason: string): string | null {
  if (!canCancel(schedule.status)) {
    return 'A escala já foi cancelada — quem precisa do horário escala de novo.';
  }
  if (reason.trim().length === 0) {
    return 'Cancelar exige a razão escrita: desmarcar sem porquê é agenda que se apaga.';
  }
  return null;
}

/** A agenda na ordem do tempo; canceladas por último. */
export function orderSchedules(schedules: readonly Schedule[]): readonly Schedule[] {
  return [...schedules].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'scheduled' ? -1 : 1;
    return a.startsAt.localeCompare(b.startsAt);
  });
}

export interface ShiftSummary {
  readonly total: number;
  readonly scheduled: number;
  readonly cancelled: number;
  /** Escalas vivas que ainda não terminaram — `nowIso` vem de fora. */
  readonly upcoming: number;
}

export function summarizeSchedules(
  schedules: readonly Schedule[],
  nowIso: string,
): ShiftSummary {
  let scheduled = 0;
  let cancelled = 0;
  let upcoming = 0;
  for (const s of schedules) {
    if (s.status === 'scheduled') {
      scheduled += 1;
      if (s.endsAt > nowIso) upcoming += 1;
    } else {
      cancelled += 1;
    }
  }
  return { total: schedules.length, scheduled, cancelled, upcoming };
}

const EMPLOYEE_NAME_MAX = 200;
const SHIFT_LABEL_MAX = 200;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma escala nova. ⭐ O PASSADO é permitido de propósito: registrar
 * o turno que já rodou é fato consumado — a agenda que recusa o passado
 * mente sobre quem trabalhou quando. Por isso NÃO há parâmetro de "hoje"
 * aqui (a mesma decisão do `spc`).
 */
export function validateNewSchedule(input: NewScheduleInput): Validation<Schedule> {
  const problems: Problem[] = [];

  const employeeId = texto(input.employeeId);
  if (employeeId === null) {
    problems.push({ field: 'employeeId', message: 'Escolha o colaborador.' });
  }

  const employeeName = texto(input.employeeName);
  if (employeeName === null) {
    problems.push({ field: 'employeeName', message: 'Informe o nome do colaborador.' });
  } else if (employeeName.length > EMPLOYEE_NAME_MAX) {
    problems.push({ field: 'employeeName', message: `Nome com no máximo ${EMPLOYEE_NAME_MAX} caracteres.` });
  }

  const shiftLabel = texto(input.shiftLabel);
  if (shiftLabel === null) {
    problems.push({ field: 'shiftLabel', message: 'Informe o turno.' });
  } else if (shiftLabel.length > SHIFT_LABEL_MAX) {
    problems.push({ field: 'shiftLabel', message: `Turno com no máximo ${SHIFT_LABEL_MAX} caracteres.` });
  }

  const startsAt = texto(input.startsAt);
  if (startsAt === null || !ISO_RE.test(startsAt)) {
    problems.push({ field: 'startsAt', message: 'Informe o início do período.' });
  }
  const endsAt = texto(input.endsAt);
  if (endsAt === null || !ISO_RE.test(endsAt)) {
    problems.push({ field: 'endsAt', message: 'Informe o fim do período.' });
  }
  if (startsAt !== null && endsAt !== null && endsAt <= startsAt) {
    problems.push({
      field: 'endsAt',
      message: 'O fim precisa vir depois do início — período vazio não escala ninguém.',
    });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      employeeId: employeeId!,
      employeeName: employeeName!,
      shiftLabel: shiftLabel!,
      startsAt: startsAt!,
      endsAt: endsAt!,
      status: 'scheduled',
      cancelledAt: null,
      cancelReason: '',
    },
  };
}
