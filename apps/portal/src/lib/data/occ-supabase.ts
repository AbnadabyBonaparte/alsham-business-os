import type { SupabaseClient } from '@supabase/supabase-js';

import type { OccurrenceStatus, Severity, SeverityStatus, Treatment } from '@alsham/occurrences';

import { DataPortError } from './port';
import type { OccPort, OccurrenceRow } from './occ-port';

const OCC = 'occ';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface OccurrenceDb {
  id: string;
  title: string;
  description: string;
  location: string | null;
  involved: string | null;
  severity_id: string | null;
  occurred_at: string;
  status: OccurrenceStatus;
  closed_at: string | null;
  outcome: string;
  created_at: string;
}

interface SeverityDb {
  id: string;
  name: string;
  position: number;
  status: SeverityStatus;
}

interface TreatmentDb {
  id: string;
  occurrence_id: string;
  action_taken: string;
  occurred_at: string;
}

export function createOccSupabasePort(db: SupabaseClient, tenantId: string): OccPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'occ.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadOccurrences() {
      const { data, error } = await db
        .schema(OCC)
        .from('occurrences')
        .select(
          'id, title, description, location, involved, severity_id, occurred_at, status, closed_at, outcome, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('occurred_at', { ascending: false });
      if (error) fail('carregar o livro de ocorrências', error);
      return ((data ?? []) as OccurrenceDb[]).map(
        (o): OccurrenceRow => ({
          id: o.id,
          title: o.title,
          description: o.description,
          location: o.location,
          involved: o.involved,
          severityId: o.severity_id,
          occurredAt: o.occurred_at,
          status: o.status,
          closedAt: o.closed_at,
          outcome: o.outcome ?? '',
          createdAt: o.created_at,
        }),
      );
    },

    async loadSeverities() {
      const { data, error } = await db
        .schema(OCC)
        .from('severities')
        .select('id, name, position, status')
        .eq('tenant_id', tenantId)
        .order('position');
      if (error) fail('carregar a régua de gravidade', error);
      return ((data ?? []) as SeverityDb[]).map(
        (s): Severity => ({
          id: s.id,
          name: s.name,
          position: Number(s.position),
          status: s.status,
        }),
      );
    },

    async loadTreatments() {
      const { data, error } = await db
        .schema(OCC)
        .from('treatments')
        .select('id, occurrence_id, action_taken, occurred_at')
        .eq('tenant_id', tenantId)
        .order('occurred_at', { ascending: true });
      if (error) fail('carregar as tratativas', error);
      return ((data ?? []) as TreatmentDb[]).map(
        (t): Treatment => ({
          id: t.id,
          occurrenceId: t.occurrence_id,
          actionTaken: t.action_taken,
          occurredAt: t.occurred_at,
        }),
      );
    },

    async registerOccurrence(input) {
      const { data, error } = await db
        .schema(OCC)
        .from('occurrences')
        .insert({
          tenant_id: tenantId,
          title: input.title,
          description: input.description,
          location: input.location,
          involved: input.involved,
          severity_id: input.severityId,
          occurred_at: input.occurredAt,
        })
        .select('id')
        .single();
      if (error) fail('registrar a ocorrência', error);
      return { occurrenceId: (data as { id: string }).id };
    },

    async recordTreatment(input) {
      const { error } = await db.schema(OCC).from('treatments').insert({
        tenant_id: tenantId,
        occurrence_id: input.occurrenceId,
        action_taken: input.actionTaken,
      });
      if (error) fail('registrar a tratativa', error);
    },

    async closeOccurrence(input) {
      const { error } = await db.schema(OCC).rpc('close_occurrence', {
        p_occurrence_id: input.occurrenceId,
        p_outcome: input.outcome,
      });
      if (error) fail('encerrar a ocorrência', error);
    },

    async createSeverity(input) {
      const { error } = await db
        .schema(OCC)
        .from('severities')
        .insert({ tenant_id: tenantId, name: input.name, position: input.position });
      if (error) fail('criar a gravidade', error);
    },
  };
}
