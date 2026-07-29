import {
  PERMISSIONS,
  canRegister,
  canTransitionEvent,
  canTransitionRegistration,
  isFull,
  validateNewEvent,
  validateNewRegistration,
} from '@alsham/event-management';
import type { EventStatus, NewEvent, NewRegistration, RegistrationStatus } from '@alsham/event-management';

import { DataPortError } from './port';
import type { EventRow, EvtPort, RegistrationRow } from './evt-port';

const agora = () => new Date().toISOString();

let seq = 1;

const events: EventRow[] = [
  {
    id: 'mock-evt-1',
    tenantId: 'mock-tenant',
    name: 'Feira de inverno — demo',
    description: 'Evento de demonstração',
    startsAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    endsAt: null,
    location: 'salão 2',
    capacity: 50,
    status: 'published',
    createdAt: agora(),
  },
];

const registrations: RegistrationRow[] = [
  {
    id: 'mock-reg-1',
    eventId: 'mock-evt-1',
    attendeeName: 'Pessoa Demo',
    contact: '@pessoa no instagram',
    note: '',
    status: 'registered',
    attendedAt: null,
    createdAt: agora(),
  },
];

export function createEvtMockPort(): EvtPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(Object.values(PERMISSIONS));
    },

    async loadEvents() {
      return events.map((e) => ({ ...e }));
    },

    async loadRegistrations() {
      return registrations.map((r) => ({ ...r }));
    },

    async createEvent(input: NewEvent) {
      const erro = validateNewEvent(input);
      if (erro !== null) throw new DataPortError(erro);
      const id = `mock-evt-${++seq}`;
      events.unshift({
        id,
        tenantId: 'mock-tenant',
        name: input.name,
        description: input.description ?? '',
        startsAt: input.startsAt,
        endsAt: input.endsAt ?? null,
        location: input.location ?? null,
        capacity: input.capacity ?? null,
        status: 'draft',
        createdAt: agora(),
      });
      return { eventId: id };
    },

    async updateEventStatus(input: { eventId: string; status: EventStatus }) {
      const idx = events.findIndex((e) => e.id === input.eventId);
      if (idx < 0) throw new DataPortError('Evento não encontrado.');
      const atual = events[idx]!;
      if (!canTransitionEvent(atual.status, input.status)) {
        throw new DataPortError('Esta mudança de estado não existe no ciclo de vida.');
      }
      events[idx] = { ...atual, status: input.status };
    },

    async createRegistration(input: NewRegistration) {
      const erro = validateNewRegistration(input);
      if (erro !== null) throw new DataPortError(erro);
      const evento = events.find((e) => e.id === input.eventId);
      if (!evento) throw new DataPortError('Evento não encontrado.');
      if (!canRegister(evento)) {
        throw new DataPortError('Inscrição só em evento publicado.');
      }
      if (isFull(evento, registrations)) {
        throw new DataPortError('O evento está lotado.');
      }
      const id = `mock-reg-${++seq}`;
      registrations.unshift({
        id,
        eventId: input.eventId,
        attendeeName: input.attendeeName,
        contact: input.contact ?? null,
        note: input.note ?? '',
        status: 'registered',
        attendedAt: null,
        createdAt: agora(),
      });
      return { registrationId: id };
    },

    async updateRegistrationStatus(input: {
      registrationId: string;
      status: RegistrationStatus;
    }) {
      const idx = registrations.findIndex((r) => r.id === input.registrationId);
      if (idx < 0) throw new DataPortError('Inscrição não encontrada.');
      const atual = registrations[idx]!;
      if (!canTransitionRegistration(atual.status, input.status)) {
        throw new DataPortError('Esta mudança de estado não existe no ciclo de vida.');
      }
      registrations[idx] = {
        ...atual,
        status: input.status,
        attendedAt: input.status === 'attended' ? agora() : atual.attendedAt,
      };
    },
  };
}
