import type {
  NewReservationInput,
  Problem,
  Reservation,
  ReservationStatus,
  Space,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 20 — Reserva de Espaços.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem recusa o conflito DE
 * VERDADE é a exclusion constraint do banco — o pacote avisa antes, com a
 * MESMA régua, para a recusa chegar com nome em vez de erro de constraint.
 */

/**
 * ⭐ Espelho de `spc.allowed_transition()` no `0035_spc.sql` — há teste que
 * lê a migration e compara. UM par só: cancelar é terminal — o período já
 * está livre, e quem precisa dele de novo reserva de novo.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [ReservationStatus, ReservationStatus])[] = [
  ['booked', 'cancelled'],
];

export function canTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canCancel(status: ReservationStatus): boolean {
  return canTransition(status, 'cancelled');
}

export function canEditReservation(status: ReservationStatus): boolean {
  return status === 'booked';
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

/** A primeira reserva viva que conflita — ou null, com o caminho livre. */
export function findConflict(
  spaceId: string,
  startsAt: string,
  endsAt: string,
  existing: readonly Reservation[],
  ignoreId?: string,
): Reservation | null {
  for (const r of existing) {
    if (r.status !== 'booked') continue;         // ⭐ a cancelada liberou o período.
    if (r.spaceId !== spaceId) continue;
    if (ignoreId !== undefined && r.id === ignoreId) continue;
    if (overlaps(startsAt, endsAt, r.startsAt, r.endsAt)) return r;
  }
  return null;
}

/** A recusa com nome — a mesma física da constraint, decidida aqui. */
export function whyCannotBook(
  space: Space | undefined,
  startsAt: string,
  endsAt: string,
  existing: readonly Reservation[],
): string | null {
  if (!space) {
    return 'O espaço não existe neste tenant.';
  }
  if (space.status === 'archived') {
    return 'Espaço fora de uso não recebe reserva nova: reative-o primeiro.';
  }
  if (endsAt <= startsAt) {
    return 'O fim precisa vir depois do início — período vazio não reserva nada.';
  }
  const conflito = findConflict(space.id, startsAt, endsAt, existing);
  if (conflito !== null) {
    return `O período cruza com outra reserva do mesmo espaço (${conflito.purpose || 'sem finalidade'}).`;
  }
  return null;
}

export function whyCannotCancel(reservation: Reservation, reason: string): string | null {
  if (!canCancel(reservation.status)) {
    return 'A reserva já foi cancelada — o horário quem quiser reserva de novo.';
  }
  if (reason.trim().length === 0) {
    return 'Cancelar exige a razão escrita: desmarcar sem porquê é agenda que se apaga.';
  }
  return null;
}

/** A agenda na ordem do tempo; canceladas por último. */
export function orderAgenda(reservations: readonly Reservation[]): readonly Reservation[] {
  return [...reservations].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'booked' ? -1 : 1;
    return a.startsAt.localeCompare(b.startsAt);
  });
}

export interface SpcSummary {
  readonly total: number;
  readonly booked: number;
  readonly cancelled: number;
  /** Reservas vivas que ainda não terminaram — `nowIso` vem de fora. */
  readonly upcoming: number;
}

export function summarizeReservations(
  reservations: readonly Reservation[],
  nowIso: string,
): SpcSummary {
  let booked = 0;
  let cancelled = 0;
  let upcoming = 0;
  for (const r of reservations) {
    if (r.status === 'booked') {
      booked += 1;
      if (r.endsAt > nowIso) upcoming += 1;
    } else {
      cancelled += 1;
    }
  }
  return { total: reservations.length, booked, cancelled, upcoming };
}

const FINALIDADE_MAX = 500;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma reserva nova. ⭐ O PASSADO é permitido de propósito: registrar
 * o uso que já aconteceu é fato consumado — a agenda que recusa o passado
 * mente sobre a ocupação. Por isso NÃO há parâmetro de "hoje" aqui.
 */
export function validateNewReservation(input: NewReservationInput): Validation<Reservation> {
  const problems: Problem[] = [];

  const spaceId = texto(input.spaceId);
  if (spaceId === null) {
    problems.push({ field: 'spaceId', message: 'Escolha o espaço.' });
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
      message: 'O fim precisa vir depois do início — período vazio não reserva nada.',
    });
  }

  let purpose = texto(input.purpose) ?? '';
  if (purpose.length > FINALIDADE_MAX) {
    problems.push({ field: 'purpose', message: `Finalidade com no máximo ${FINALIDADE_MAX} caracteres.` });
    purpose = purpose.slice(0, FINALIDADE_MAX);
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      spaceId: spaceId!,
      purpose,
      startsAt: startsAt!,
      endsAt: endsAt!,
      status: 'booked',
      cancelledAt: null,
      cancelReason: '',
    },
  };
}
