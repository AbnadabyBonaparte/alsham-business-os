import type {
  EventStatus,
  NewEvent,
  NewRegistration,
  Registration,
  RegistrationStatus,
  TenantEvent,
} from '@alsham/event-management';

export interface EventRow extends TenantEvent {
  readonly createdAt: string;
}

export interface RegistrationRow extends Registration {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 11 — própria (Lei do Lego §5.5.8).
 * Sem DELETE: cancelar evento é status, e a desistência é história da lista.
 */
export interface EvtPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadEvents(): Promise<EventRow[]>;
  loadRegistrations(): Promise<RegistrationRow[]>;
  createEvent(input: NewEvent): Promise<{ eventId: string }>;
  updateEventStatus(input: { eventId: string; status: EventStatus }): Promise<void>;
  createRegistration(input: NewRegistration): Promise<{ registrationId: string }>;
  updateRegistrationStatus(input: {
    registrationId: string;
    status: RegistrationStatus;
  }): Promise<void>;
}
