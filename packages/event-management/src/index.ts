/**
 * `@alsham/event-management` — Módulo 11, Eventos.
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI. O que este pacote
 * sabe é como um evento nasce, quando a lista abre, quantas vagas restam e
 * o que a presença exige. Quem grava é o schema `evt`; quem mostra é o
 * portal; quem conta ao mundo é o correio.
 *
 * ⚠️ O nome do pacote é `event-management` e o módulo é `evt` — nunca
 * `events`: "evento" já é o vocabulário do coração da plataforma
 * (`EventEnvelope`, `core.event_outbox`). Sol Único.
 *
 * ⚠️ Este pacote **não importa nenhum outro módulo**, e não vai importar. Há
 * guarda no CI ("módulo não conhece módulo") que confere isso nos dois
 * sentidos, para os doze módulos.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  EVENT_TRANSITIONS,
  REGISTRATION_TRANSITIONS,
  canTransitionEvent,
  canTransitionRegistration,
  canPublish,
  canCancelEvent,
  canHold,
  canRegister,
  canAttend,
  activeRegistrations,
  remainingCapacity,
  isFull,
  isUpcoming,
  validateNewEvent,
  validateNewRegistration,
  summarizeEvents,
} from './event.ts';

export type {
  EventId,
  EventStatus,
  NewEvent,
  NewRegistration,
  Registration,
  RegistrationId,
  RegistrationStatus,
  TenantEvent,
  TenantId,
} from './types.ts';
