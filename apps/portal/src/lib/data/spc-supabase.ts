import type { SupabaseClient } from '@supabase/supabase-js';

import type { ReservationStatus, Space, SpaceStatus } from '@alsham/spaces';

import { DataPortError } from './port';
import type { ReservationRow, SpcPort } from './spc-port';

const SPC = 'spc';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface SpaceDb {
  id: string;
  name: string;
  description: string;
  capacity: number | null;
  status: SpaceStatus;
}

interface ReservationDb {
  id: string;
  space_id: string;
  purpose: string;
  starts_at: string;
  ends_at: string;
  status: ReservationStatus;
  cancelled_at: string | null;
  cancel_reason: string;
  created_at: string;
}

export function createSpcSupabasePort(db: SupabaseClient, tenantId: string): SpcPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'spc.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadSpaces() {
      const { data, error } = await db
        .schema(SPC)
        .from('spaces')
        .select('id, name, description, capacity, status')
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) fail('carregar os espaços', error);
      return ((data ?? []) as SpaceDb[]).map(
        (s): Space => ({
          id: s.id,
          name: s.name,
          description: s.description ?? '',
          capacity: s.capacity === null ? null : Number(s.capacity),
          status: s.status,
        }),
      );
    },

    async loadReservations() {
      const { data, error } = await db
        .schema(SPC)
        .from('reservations')
        .select('id, space_id, purpose, starts_at, ends_at, status, cancelled_at, cancel_reason, created_at')
        .eq('tenant_id', tenantId)
        .order('starts_at', { ascending: false });
      if (error) fail('carregar a agenda', error);
      return ((data ?? []) as ReservationDb[]).map(
        (r): ReservationRow => ({
          id: r.id,
          spaceId: r.space_id,
          purpose: r.purpose ?? '',
          startsAt: r.starts_at,
          endsAt: r.ends_at,
          status: r.status,
          cancelledAt: r.cancelled_at,
          cancelReason: r.cancel_reason ?? '',
          createdAt: r.created_at,
        }),
      );
    },

    async createSpace(input) {
      const { error } = await db.schema(SPC).from('spaces').insert({
        tenant_id: tenantId,
        name: input.name,
        description: input.description,
        capacity: input.capacity,
      });
      if (error) fail('criar o espaço', error);
    },

    async setSpaceStatus(input) {
      const { error } = await db
        .schema(SPC)
        .from('spaces')
        .update({ status: input.status })
        .eq('id', input.spaceId)
        .eq('tenant_id', tenantId);
      if (error) fail('mudar o estado do espaço', error);
    },

    async bookReservation(input) {
      const { data, error } = await db
        .schema(SPC)
        .from('reservations')
        .insert({
          tenant_id: tenantId,
          space_id: input.spaceId,
          purpose: input.purpose,
          starts_at: input.startsAt,
          ends_at: input.endsAt,
        })
        .select('id')
        .single();
      if (error) fail('reservar o período', error);
      return { reservationId: (data as { id: string }).id };
    },

    async cancelReservation(input) {
      const { error } = await db
        .schema(SPC)
        .from('reservations')
        .update({ status: 'cancelled', cancel_reason: input.reason })
        .eq('id', input.reservationId)
        .eq('tenant_id', tenantId);
      if (error) fail('cancelar a reserva', error);
    },
  };
}
