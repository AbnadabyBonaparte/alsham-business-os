import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  EventStatus,
  NewEvent,
  NewRegistration,
  RegistrationStatus,
} from '@alsham/event-management';

import { DataPortError } from './port';
import type { EventRow, EvtPort, RegistrationRow } from './evt-port';

const EVT = 'evt';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface EventDb {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  capacity: number | null;
  status: EventStatus;
  created_at: string;
}

interface RegistrationDb {
  id: string;
  event_id: string;
  attendee_name: string;
  contact: string | null;
  note: string;
  status: RegistrationStatus;
  attended_at: string | null;
  created_at: string;
}

export function createEvtSupabasePort(db: SupabaseClient, tenantId: string): EvtPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'evt.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadEvents() {
      const { data, error } = await db
        .schema(EVT)
        .from('events')
        .select('id, tenant_id, name, description, starts_at, ends_at, location, capacity, status, created_at')
        .eq('tenant_id', tenantId)
        .order('starts_at', { ascending: true });
      if (error) fail('carregar a agenda', error);
      return ((data ?? []) as EventDb[]).map(
        (e): EventRow => ({
          id: e.id,
          tenantId: e.tenant_id,
          name: e.name,
          description: e.description ?? '',
          startsAt: e.starts_at,
          endsAt: e.ends_at,
          location: e.location,
          capacity: e.capacity === null ? null : Number(e.capacity),
          status: e.status,
          createdAt: e.created_at,
        }),
      );
    },

    async loadRegistrations() {
      const { data, error } = await db
        .schema(EVT)
        .from('registrations')
        .select('id, event_id, attendee_name, contact, note, status, attended_at, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });
      if (error) fail('carregar as inscrições', error);
      return ((data ?? []) as RegistrationDb[]).map(
        (r): RegistrationRow => ({
          id: r.id,
          eventId: r.event_id,
          attendeeName: r.attendee_name,
          contact: r.contact,
          note: r.note ?? '',
          status: r.status,
          attendedAt: r.attended_at,
          createdAt: r.created_at,
        }),
      );
    },

    async createEvent(input: NewEvent) {
      const { data, error } = await db
        .schema(EVT)
        .from('events')
        .insert({
          tenant_id: tenantId,
          name: input.name,
          description: input.description ?? '',
          starts_at: input.startsAt,
          ends_at: input.endsAt ?? null,
          location: input.location ?? null,
          capacity: input.capacity ?? null,
        })
        .select('id')
        .single();
      if (error) fail('criar o evento', error);
      return { eventId: (data as { id: string }).id };
    },

    async updateEventStatus(input: { eventId: string; status: EventStatus }) {
      const { error } = await db
        .schema(EVT)
        .from('events')
        .update({ status: input.status })
        .eq('id', input.eventId)
        .eq('tenant_id', tenantId);
      if (error) fail('mudar o estado do evento', error);
    },

    async createRegistration(input: NewRegistration) {
      const { data, error } = await db
        .schema(EVT)
        .from('registrations')
        .insert({
          tenant_id: tenantId,
          event_id: input.eventId,
          attendee_name: input.attendeeName,
          contact: input.contact ?? null,
          note: input.note ?? '',
        })
        .select('id')
        .single();
      if (error) fail('registrar a inscrição', error);
      return { registrationId: (data as { id: string }).id };
    },

    async updateRegistrationStatus(input: {
      registrationId: string;
      status: RegistrationStatus;
    }) {
      const { error } = await db
        .schema(EVT)
        .from('registrations')
        .update({ status: input.status })
        .eq('id', input.registrationId)
        .eq('tenant_id', tenantId);
      if (error) fail('mudar o estado da inscrição', error);
    },
  };
}
