import type { SupabaseClient } from '@supabase/supabase-js';

import type { LeadStatus } from '@alsham/leads';

import { DataPortError } from './port';
import type { LeadPort, LeadRow } from './lead-port';

const LEAD = 'lead';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface LeadDb {
  id: string;
  name: string;
  contact: string;
  source: string;
  interest: string;
  assignee_user_id: string | null;
  status: LeadStatus;
  decided_at: string | null;
  discard_reason: string;
  party_id: string | null;
  party_name: string;
  opportunity_id: string | null;
  opportunity_title: string;
  created_at: string;
}

export function createLeadSupabasePort(db: SupabaseClient, tenantId: string): LeadPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'lead.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadLeads() {
      const { data, error } = await db
        .schema(LEAD)
        .from('leads')
        .select(
          'id, name, contact, source, interest, assignee_user_id, status, decided_at, discard_reason, party_id, party_name, opportunity_id, opportunity_title, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('created_at');
      if (error) fail('carregar a fila de leads', error);
      return ((data ?? []) as LeadDb[]).map(
        (l): LeadRow => ({
          id: l.id,
          name: l.name,
          contact: l.contact ?? '',
          source: l.source ?? '',
          interest: l.interest ?? '',
          assigneeUserId: l.assignee_user_id,
          status: l.status,
          decidedAt: l.decided_at,
          discardReason: l.discard_reason ?? '',
          partyId: l.party_id,
          partyName: l.party_name ?? '',
          opportunityId: l.opportunity_id,
          opportunityTitle: l.opportunity_title ?? '',
          createdAt: l.created_at,
        }),
      );
    },

    async createLead(input) {
      const { data, error } = await db
        .schema(LEAD)
        .from('leads')
        .insert({
          tenant_id: tenantId,
          name: input.name,
          contact: input.contact,
          source: input.source,
          interest: input.interest,
        })
        .select('id')
        .single();
      if (error) fail('registrar o lead', error);
      return { leadId: (data as { id: string }).id };
    },

    async setStatus(input) {
      const patch: Record<string, unknown> = { status: input.status };
      if (input.discardReason !== undefined) patch.discard_reason = input.discardReason;
      if (input.partyId !== undefined) patch.party_id = input.partyId;
      if (input.partyName !== undefined) patch.party_name = input.partyName;
      if (input.opportunityId !== undefined) patch.opportunity_id = input.opportunityId;
      if (input.opportunityTitle !== undefined) patch.opportunity_title = input.opportunityTitle;
      const { error } = await db
        .schema(LEAD)
        .from('leads')
        .update(patch)
        .eq('id', input.leadId)
        .eq('tenant_id', tenantId);
      if (error) fail('mover o lead', error);
    },
  };
}
