import type { SupabaseClient } from '@supabase/supabase-js';

import type { MntPriority, OrderKind, OrderStatus, PriorityStatus } from '@alsham/maintenance';

import { DataPortError } from './port';
import type { MntOrderRow, MntPort } from './mnt-port';

const MNT = 'mnt';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface OrderDb {
  id: string;
  title: string;
  description: string;
  kind: OrderKind;
  target: string;
  asset_id: string | null;
  priority_id: string | null;
  assignee_user_id: string | null;
  recurrence_days: number | null;
  cost_cents: number | null;
  currency: string | null;
  status: OrderStatus;
  completed_at: string | null;
  completion_note: string;
  created_at: string;
}

interface PriorityDb {
  id: string;
  name: string;
  position: number;
  status: PriorityStatus;
}

export function createMntSupabasePort(db: SupabaseClient, tenantId: string): MntPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'mnt.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadOrders() {
      const { data, error } = await db
        .schema(MNT)
        .from('orders')
        .select(
          'id, title, description, kind, target, asset_id, priority_id, assignee_user_id, recurrence_days, cost_cents, currency, status, completed_at, completion_note, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) fail('carregar as ordens de manutenção', error);
      return ((data ?? []) as OrderDb[]).map(
        (o): MntOrderRow => ({
          id: o.id,
          title: o.title,
          description: o.description ?? '',
          kind: o.kind,
          target: o.target,
          assetId: o.asset_id,
          priorityId: o.priority_id,
          assigneeUserId: o.assignee_user_id,
          recurrenceDays: o.recurrence_days === null ? null : Number(o.recurrence_days),
          costCents: o.cost_cents === null ? null : Number(o.cost_cents),
          currency: o.currency,
          status: o.status,
          completedAt: o.completed_at,
          completionNote: o.completion_note ?? '',
          createdAt: o.created_at,
        }),
      );
    },

    async loadPriorities() {
      const { data, error } = await db
        .schema(MNT)
        .from('priorities')
        .select('id, name, position, status')
        .eq('tenant_id', tenantId)
        .order('position');
      if (error) fail('carregar a régua de prioridade', error);
      return ((data ?? []) as PriorityDb[]).map(
        (p): MntPriority => ({
          id: p.id,
          name: p.name,
          position: Number(p.position),
          status: p.status,
        }),
      );
    },

    async createOrder(input) {
      const { data, error } = await db
        .schema(MNT)
        .from('orders')
        .insert({
          tenant_id: tenantId,
          title: input.title,
          description: input.description,
          kind: input.kind,
          target: input.target,
          priority_id: input.priorityId,
          recurrence_days: input.recurrenceDays,
        })
        .select('id')
        .single();
      if (error) fail('abrir a ordem', error);
      return { orderId: (data as { id: string }).id };
    },

    async setStatus(input) {
      const patch: Record<string, unknown> = { status: input.status };
      if (input.completionNote !== undefined) patch.completion_note = input.completionNote;
      if (input.costCents !== undefined) patch.cost_cents = input.costCents;
      if (input.currency !== undefined) patch.currency = input.currency;
      const { error } = await db
        .schema(MNT)
        .from('orders')
        .update(patch)
        .eq('id', input.orderId)
        .eq('tenant_id', tenantId);
      if (error) fail('mover a ordem', error);
    },

    async createPriority(input) {
      const { error } = await db
        .schema(MNT)
        .from('priorities')
        .insert({ tenant_id: tenantId, name: input.name, position: input.position });
      if (error) fail('criar a prioridade', error);
    },
  };
}
