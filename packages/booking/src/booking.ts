import type { Booking, BookingStatus, NewBookingInput, Problem, Validation } from './types.ts';

/**
 * O motor do Módulo 97 — Agendamento (Vertical Beleza).
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a RLS e
 * os gatilhos do `0112_booking.sql`; o pacote avisa antes, com a MESMA régua.
 *
 * ⭐ Reaproveita a física do no-show do `appointment` — mas o cliente é do `crm`
 * por id solto (não paciente, não PHI), o serviço é TEXTO LIVRE e o profissional
 * é id solto ao módulo `professional`.
 */

/**
 * ⭐ Espelho de `booking.allowed_transition()` no `0112_booking.sql` — há teste
 * que lê a migration e compara. `scheduled → attended | no_show | cancelled`: os
 * três fins são TERMINAIS (a física do appointment; quem remarca abre OUTRO).
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [BookingStatus, BookingStatus])[] = [
  ['scheduled', 'attended'],
  ['scheduled', 'no_show'],
  ['scheduled', 'cancelled'],
];

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** Só o agendado se remarca/edita; o desfecho congela a linha. */
export function canReschedule(status: BookingStatus): boolean {
  return status === 'scheduled';
}

/** Os três desfechos são terminais — nenhuma saída dali. */
export function isTerminal(status: BookingStatus): boolean {
  return status === 'attended' || status === 'no_show' || status === 'cancelled';
}

/** Cancelar exige razão; comparecer e faltar, não. */
export function requiresReason(to: BookingStatus): boolean {
  return to === 'cancelled';
}

/** A agenda: os agendados primeiro, depois por horário. */
export function orderBookings(bookings: readonly Booking[]): readonly Booking[] {
  const peso = (s: BookingStatus): number => (s === 'scheduled' ? 0 : 1);
  return [...bookings].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    return a.scheduledAt.localeCompare(b.scheduledAt);
  });
}

export interface BookingSummary {
  readonly total: number;
  readonly scheduled: number;
  readonly attended: number;
  readonly noShow: number;
  readonly cancelled: number;
}

export function summarize(bookings: readonly Booking[]): BookingSummary {
  let scheduled = 0;
  let attended = 0;
  let noShow = 0;
  let cancelled = 0;
  for (const b of bookings) {
    if (b.status === 'scheduled') scheduled += 1;
    else if (b.status === 'attended') attended += 1;
    else if (b.status === 'no_show') noShow += 1;
    else cancelled += 1;
  }
  return { total: bookings.length, scheduled, attended, noShow, cancelled };
}

const TEXTO_MAX = 200;
const SERVICE_MAX = 200;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um agendamento novo. `clientName`, `service` e `scheduledAt` são
 * OBRIGATÓRIOS — um agendamento sem cliente, sem serviço ou sem horário não é
 * agendamento. `clientId` e `professionalId` são IDs SOLTOS OPCIONAIS: a
 * validação confere que a tela informou um valor, nunca que a linha existe no
 * crm ou no professional (isso é integridade de outro schema). O agendamento
 * nasce sempre `scheduled` (o desfecho é decisão à parte).
 */
export function validateNewBooking(input: NewBookingInput): Validation<Booking> {
  const problems: Problem[] = [];

  const clientName = texto(input.clientName);
  if (clientName === null) {
    problems.push({ field: 'clientName', message: 'Informe o cliente.' });
  } else if (clientName.length > TEXTO_MAX) {
    problems.push({ field: 'clientName', message: `Nome do cliente com no máximo ${TEXTO_MAX} caracteres.` });
  }

  const service = texto(input.service);
  if (service === null) {
    problems.push({ field: 'service', message: 'Informe o serviço (texto livre — ex.: corte, coloração).' });
  } else if (service.length > SERVICE_MAX) {
    problems.push({ field: 'service', message: `Serviço com no máximo ${SERVICE_MAX} caracteres.` });
  }

  const scheduledAt = texto(input.scheduledAt);
  if (scheduledAt === null) {
    problems.push({ field: 'scheduledAt', message: 'Informe o horário do agendamento.' });
  }

  const clientId = texto(input.clientId);
  const professionalId = texto(input.professionalId);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      clientId,
      clientName: clientName!,
      professionalId,
      service: service!,
      scheduledAt: scheduledAt!,
      status: 'scheduled',
      cancelReason: '',
    },
  };
}
