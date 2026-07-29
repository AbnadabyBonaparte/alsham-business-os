import type { SupabaseClient } from '@supabase/supabase-js';

import type { ItemStatus, MovementKind, NewItem, NewMovement } from '@alsham/inventory';

import { DataPortError } from './port';
import type { InvPort, ItemRow, MovementRow } from './inv-port';

const INV = 'inv';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface ItemDb {
  id: string;
  tenant_id: string;
  description: string;
  unit: string;
  sku: string | null;
  status: ItemStatus;
  created_at: string;
}

interface MovementDb {
  id: string;
  item_id: string;
  kind: MovementKind;
  quantity: number;
  reason: string;
  external_ref: string | null;
  location: string | null;
  occurred_at: string;
  created_at: string;
}

export function createInvSupabasePort(db: SupabaseClient, tenantId: string): InvPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'inv.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadItems() {
      const { data, error } = await db
        .schema(INV)
        .from('items')
        .select('id, tenant_id, description, unit, sku, status, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) fail('carregar os itens', error);
      return ((data ?? []) as ItemDb[]).map(
        (i): ItemRow => ({
          id: i.id,
          tenantId: i.tenant_id,
          description: i.description,
          unit: i.unit,
          sku: i.sku,
          status: i.status,
          createdAt: i.created_at,
        }),
      );
    },

    async loadMovements() {
      const { data, error } = await db
        .schema(INV)
        .from('movements')
        .select('id, item_id, kind, quantity, reason, external_ref, location, occurred_at, created_at')
        .eq('tenant_id', tenantId)
        .order('occurred_at', { ascending: false });
      if (error) fail('carregar o livro de movimentos', error);
      return ((data ?? []) as MovementDb[]).map(
        (m): MovementRow => ({
          id: m.id,
          itemId: m.item_id,
          kind: m.kind,
          quantity: Number(m.quantity),
          reason: m.reason,
          externalRef: m.external_ref,
          location: m.location,
          occurredAt: m.occurred_at,
          createdAt: m.created_at,
        }),
      );
    },

    async createItem(item: NewItem) {
      const { data, error } = await db
        .schema(INV)
        .from('items')
        .insert({
          tenant_id: tenantId,
          description: item.description,
          unit: item.unit,
          sku: item.sku ?? null,
        })
        .select('id')
        .single();
      if (error) fail('cadastrar o item', error);
      return { itemId: (data as { id: string }).id };
    },

    async updateItem(input) {
      const { error } = await db
        .schema(INV)
        .from('items')
        .update({ description: input.description, unit: input.unit, sku: input.sku })
        .eq('id', input.itemId)
        .eq('tenant_id', tenantId);
      if (error) fail('editar o item', error);
    },

    async updateItemStatus(input: { itemId: string; status: ItemStatus }) {
      const { error } = await db
        .schema(INV)
        .from('items')
        .update({ status: input.status })
        .eq('id', input.itemId)
        .eq('tenant_id', tenantId);
      if (error) fail('mudar o estado do item', error);
    },

    async registerMovement(movement: NewMovement) {
      const { data, error } = await db
        .schema(INV)
        .from('movements')
        .insert({
          tenant_id: tenantId,
          item_id: movement.itemId,
          kind: movement.kind,
          quantity: movement.quantity,
          reason: movement.reason ?? '',
          external_ref: movement.externalRef ?? null,
          location: movement.location ?? null,
        })
        .select('id')
        .single();
      if (error) fail('lançar o movimento no livro', error);
      return { movementId: (data as { id: string }).id };
    },
  };
}
