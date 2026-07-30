import type { SupabaseClient } from '@supabase/supabase-js';

import type { VisitStatus } from '@alsham/visits';

import { DataPortError } from './port';
import type { VisitRow, VisPort } from './vis-port';

const VIS = 'vis';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface VisitDb {
  id: string;
  visitor_name: string;
  visitor_document: string;
  visitor_contact: string;
  host: string;
  reason: string;
  status: VisitStatus;
  expected_at: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  cancel_reason: string;
  corrects_visit_id: string | null;
  created_at: string;
}

export function createVisSupabasePort(db: SupabaseClient, tenantId: string): VisPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'vis.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadVisits() {
      const { data, error } = await db
        .schema(VIS)
        .from('visits')
        .select(
          'id, visitor_name, visitor_document, visitor_contact, host, reason, status, expected_at, checked_in_at, checked_out_at, cancel_reason, corrects_visit_id, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) fail('carregar o livro da portaria', error);
      return ((data ?? []) as VisitDb[]).map(
        (v): VisitRow => ({
          id: v.id,
          visitorName: v.visitor_name,
          visitorDocument: v.visitor_document ?? '',
          visitorContact: v.visitor_contact ?? '',
          host: v.host,
          reason: v.reason ?? '',
          status: v.status,
          expectedAt: v.expected_at,
          checkedInAt: v.checked_in_at,
          checkedOutAt: v.checked_out_at,
          cancelReason: v.cancel_reason ?? '',
          correctsVisitId: v.corrects_visit_id,
          createdAt: v.created_at,
        }),
      );
    },

    async createVisit(input) {
      // A hora NÃO vai daqui: o carimbo do check-in é do gatilho.
      const { data, error } = await db
        .schema(VIS)
        .from('visits')
        .insert({
          tenant_id: tenantId,
          visitor_name: input.visitorName,
          visitor_document: input.visitorDocument,
          visitor_contact: input.visitorContact,
          host: input.host,
          reason: input.reason,
          status: input.scheduled ? 'scheduled' : 'checked_in',
          expected_at: input.expectedAt,
          corrects_visit_id: input.correctsVisitId,
        })
        .select('id')
        .single();
      if (error) fail('registrar a visita', error);
      return { visitId: (data as { id: string }).id };
    },

    async setStatus(input) {
      const patch: Record<string, unknown> = { status: input.status };
      if (input.cancelReason !== undefined) patch.cancel_reason = input.cancelReason;
      const { error } = await db
        .schema(VIS)
        .from('visits')
        .update(patch)
        .eq('id', input.visitId)
        .eq('tenant_id', tenantId);
      if (error) fail('mover a visita', error);
    },
  };
}
