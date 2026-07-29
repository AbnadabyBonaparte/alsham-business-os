import type {
  EventStatus,
  NewEvent,
  NewRegistration,
  Registration,
  RegistrationStatus,
  TenantEvent,
} from './types.ts';

/**
 * O motor dos eventos — **puro**.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** a lotação, o ciclo e a validação
 * moram aqui. A tela pergunta e desenha; ela nunca conta vaga à mão.
 */

/**
 * ⭐ Ciclo do EVENTO — espelho de `evt.allowed_transition()` em `0026_evt.sql`.
 * `published → draft` não existe: publicado com inscritos é compromisso.
 */
export const EVENT_TRANSITIONS: readonly (readonly [EventStatus, EventStatus])[] = [
  ['draft', 'published'],
  ['draft', 'cancelled'],
  ['published', 'held'],
  ['published', 'cancelled'],
] as const;

/**
 * ⭐ Ciclo da INSCRIÇÃO — espelho de `evt.allowed_registration_transition()`.
 * Presença e cancelamento são terminais.
 */
export const REGISTRATION_TRANSITIONS: readonly (readonly [
  RegistrationStatus,
  RegistrationStatus,
])[] = [
  ['registered', 'confirmed'],
  ['registered', 'cancelled'],
  ['registered', 'attended'],
  ['confirmed', 'cancelled'],
  ['confirmed', 'attended'],
] as const;

export function canTransitionEvent(from: EventStatus, to: EventStatus): boolean {
  return EVENT_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canTransitionRegistration(
  from: RegistrationStatus,
  to: RegistrationStatus,
): boolean {
  return REGISTRATION_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canPublish(status: EventStatus): boolean {
  return canTransitionEvent(status, 'published');
}

export function canCancelEvent(status: EventStatus): boolean {
  return canTransitionEvent(status, 'cancelled');
}

/**
 * ⭐ Realizado só DEPOIS de começar — honestidade de calendário, a mesma
 * régua da proposta expirada. `nowIso` vem de quem chama; o pacote não tem
 * relógio.
 */
export function canHold(event: TenantEvent, nowIso: string): boolean {
  return canTransitionEvent(event.status, 'held') && event.startsAt <= nowIso;
}

/** Inscrição só em evento PUBLICADO — publicar é justamente abrir a lista. */
export function canRegister(event: TenantEvent): boolean {
  return event.status === 'published';
}

/** Presença só em evento publicado ou realizado. */
export function canAttend(registration: Registration, event: TenantEvent): boolean {
  return (
    canTransitionRegistration(registration.status, 'attended') &&
    (event.status === 'published' || event.status === 'held')
  );
}

/** Cancelada não ocupa vaga; todo o resto ocupa. */
export function activeRegistrations(
  registrations: readonly Registration[],
  eventId: string,
): number {
  return registrations.filter((r) => r.eventId === eventId && r.status !== 'cancelled').length;
}

/**
 * ⭐ AS VAGAS: `null` quando o evento não tem teto — sem teto não há conta,
 * e inventar uma seria a Lei 7 ao contrário.
 */
export function remainingCapacity(
  event: TenantEvent,
  registrations: readonly Registration[],
): number | null {
  if (event.capacity === null) return null;
  return Math.max(0, event.capacity - activeRegistrations(registrations, event.id));
}

export function isFull(event: TenantEvent, registrations: readonly Registration[]): boolean {
  const restam = remainingCapacity(event, registrations);
  return restam !== null && restam === 0;
}

/** O evento ainda vai acontecer? (ISO ordena.) */
export function isUpcoming(event: TenantEvent, nowIso: string): boolean {
  return (
    (event.status === 'draft' || event.status === 'published') && event.startsAt > nowIso
  );
}

const NOME_MAX = 200;
const ISO_DATA = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?([.+Z]|$|[-+]\d{2}:?\d{2})?.*)?$/;

/** O erro de validação de um evento novo, ou `null`. */
export function validateNewEvent(input: NewEvent): string | null {
  if (input.name.trim().length === 0) {
    return 'O evento precisa de um nome.';
  }
  if (input.name.length > NOME_MAX) {
    return `O nome vai até ${NOME_MAX} caracteres.`;
  }
  if (input.startsAt.trim().length === 0 || !ISO_DATA.test(input.startsAt.trim())) {
    return 'O evento precisa de quando começa (data/hora ISO) — sem data é ideia, não evento.';
  }
  if (input.endsAt != null && input.endsAt.trim().length > 0) {
    if (!ISO_DATA.test(input.endsAt.trim())) {
      return 'O fim, se informado, vai em data/hora ISO.';
    }
    if (input.endsAt < input.startsAt) {
      return 'O evento não pode terminar antes de começar.';
    }
  }
  if (input.capacity != null) {
    if (!Number.isInteger(input.capacity) || input.capacity <= 0) {
      return 'A capacidade, se informada, é um inteiro positivo.';
    }
  }
  if (input.location != null && input.location !== '' && input.location.trim().length === 0) {
    return 'Local em branco não existe: ou o evento tem onde, ou o campo fica vazio.';
  }
  return null;
}

/** O erro de validação de uma inscrição nova, ou `null`. */
export function validateNewRegistration(input: NewRegistration): string | null {
  if (input.eventId.trim().length === 0) {
    return 'A inscrição precisa de um evento.';
  }
  if (input.attendeeName.trim().length === 0) {
    return 'A inscrição precisa do nome de quem vem.';
  }
  if (input.contact != null && input.contact !== '' && input.contact.trim().length === 0) {
    return 'Contato em branco não existe: ou tem, ou o campo fica vazio.';
  }
  return null;
}

/** Um resumo para o cabeçalho. Contagem, nunca estimativa. */
export function summarizeEvents(
  events: readonly TenantEvent[],
  registrations: readonly Registration[],
  nowIso: string,
): {
  readonly total: number;
  readonly upcoming: number;
  readonly published: number;
  readonly held: number;
  readonly activeRegistrations: number;
  readonly attended: number;
} {
  return {
    total: events.length,
    upcoming: events.filter((e) => isUpcoming(e, nowIso)).length,
    published: events.filter((e) => e.status === 'published').length,
    held: events.filter((e) => e.status === 'held').length,
    activeRegistrations: registrations.filter((r) => r.status !== 'cancelled').length,
    attended: registrations.filter((r) => r.status === 'attended').length,
  };
}
