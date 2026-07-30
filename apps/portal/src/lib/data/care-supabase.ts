import type { SupabaseClient } from '@supabase/supabase-js';

import type { CareCategory, CarePriority, Interaction, SetupStatus, TicketStatus } from '@alsham/care';

import { DataPortError } from './port';
import type { CarePort, TicketRow } from './care-port';

const CARE = 'care';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface TicketDb {
  id: string;
  subject: string;
  description: string;
  requester_name: string;
  requester_contact: string | null;
  party_id: string | null;
  category_id: string | null;
  priority_id: string | null;
  assignee_user_id: string | null;
  due_at: string | null;
  status: TicketStatus;
  resolved_at: string | null;
  resolution_note: string;
  created_at: string;
}

interface SetupDb {
  id: string;
  name: string;
  status: SetupStatus;
  position?: number;
}

interface InteractionDb {
  id: string;
  ticket_id: string;
  body: string;
  channel: string | null;
  occurred_at: string;
}

export function createCareSupabasePort(db: SupabaseClient, tenantId: string): CarePort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'care.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadTickets() {
      const { data, error } = await db
        .schema(CARE)
        .from('tickets')
        .select(
          'id, subject, description, requester_name, requester_contact, party_id, category_id, priority_id, assignee_user_id, due_at, status, resolved_at, resolution_note, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) fail('carregar os casos', error);
      return ((data ?? []) as TicketDb[]).map(
        (t): TicketRow => ({
          id: t.id,
          subject: t.subject,
          description: t.description ?? '',
          requesterName: t.requester_name,
          requesterContact: t.requester_contact,
          partyId: t.party_id,
          categoryId: t.category_id,
          priorityId: t.priority_id,
          assigneeUserId: t.assignee_user_id,
          dueAt: t.due_at,
          status: t.status,
          resolvedAt: t.resolved_at,
          resolutionNote: t.resolution_note ?? '',
          createdAt: t.created_at,
        }),
      );
    },

    async loadCategories() {
      const { data, error } = await db
        .schema(CARE)
        .from('categories')
        .select('id, name, status')
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) fail('carregar as categorias', error);
      return ((data ?? []) as SetupDb[]).map(
        (c): CareCategory => ({ id: c.id, name: c.name, status: c.status }),
      );
    },

    async loadPriorities() {
      const { data, error } = await db
        .schema(CARE)
        .from('priorities')
        .select('id, name, position, status')
        .eq('tenant_id', tenantId)
        .order('position');
      if (error) fail('carregar as prioridades', error);
      return ((data ?? []) as SetupDb[]).map(
        (p): CarePriority => ({
          id: p.id,
          name: p.name,
          position: Number(p.position ?? 0),
          status: p.status,
        }),
      );
    },

    async loadInteractions() {
      const { data, error } = await db
        .schema(CARE)
        .from('interactions')
        .select('id, ticket_id, body, channel, occurred_at')
        .eq('tenant_id', tenantId)
        .order('occurred_at', { ascending: true });
      if (error) fail('carregar a conversa', error);
      return ((data ?? []) as InteractionDb[]).map(
        (i): Interaction => ({
          id: i.id,
          ticketId: i.ticket_id,
          body: i.body,
          channel: i.channel,
          occurredAt: i.occurred_at,
        }),
      );
    },

    async createTicket(input) {
      const { data, error } = await db
        .schema(CARE)
        .from('tickets')
        .insert({
          tenant_id: tenantId,
          subject: input.subject,
          description: input.description,
          requester_name: input.requesterName,
          requester_contact: input.requesterContact,
          category_id: input.categoryId,
          priority_id: input.priorityId,
          due_at: input.dueAt,
        })
        .select('id')
        .single();
      if (error) fail('abrir o caso', error);
      return { ticketId: (data as { id: string }).id };
    },

    async setStatus(input) {
      const patch: Record<string, unknown> = { status: input.status };
      if (input.resolutionNote !== undefined) patch.resolution_note = input.resolutionNote;
      const { error } = await db
        .schema(CARE)
        .from('tickets')
        .update(patch)
        .eq('id', input.ticketId)
        .eq('tenant_id', tenantId);
      if (error) fail('mudar o estado do caso', error);
    },

    async recordInteraction(input) {
      const { error } = await db.schema(CARE).from('interactions').insert({
        tenant_id: tenantId,
        ticket_id: input.ticketId,
        body: input.body,
        channel: input.channel,
      });
      if (error) fail('registrar a interação', error);
    },

    async createCategory(input) {
      const { error } = await db
        .schema(CARE)
        .from('categories')
        .insert({ tenant_id: tenantId, name: input.name });
      if (error) fail('criar a categoria', error);
    },

    async createPriority(input) {
      const { error } = await db
        .schema(CARE)
        .from('priorities')
        .insert({ tenant_id: tenantId, name: input.name, position: input.position });
      if (error) fail('criar a prioridade', error);
    },
  };
}
