import type { SupabaseClient } from '@supabase/supabase-js';

import type { Category, CategoryStatus, EntryKind } from '@alsham/cashflow';

import { DataPortError } from './port';
import type { CashPort, EntryRow } from './cash-port';

const CASH = 'cash';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface EntryDb {
  id: string;
  kind: EntryKind;
  amount_cents: number;
  currency: string;
  description: string;
  reason: string;
  category_id: string | null;
  account: string | null;
  external_ref: string | null;
  occurred_on: string;
  created_at: string;
}

interface CategoryDb {
  id: string;
  name: string;
  status: CategoryStatus;
}

export function createCashSupabasePort(db: SupabaseClient, tenantId: string): CashPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'cash.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadEntries() {
      const { data, error } = await db
        .schema(CASH)
        .from('entries')
        .select(
          'id, kind, amount_cents, currency, description, reason, category_id, account, external_ref, occurred_on, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) fail('carregar o livro-caixa', error);
      return ((data ?? []) as EntryDb[]).map(
        (e): EntryRow => ({
          id: e.id,
          kind: e.kind,
          amountCents: Number(e.amount_cents),
          currency: e.currency,
          description: e.description ?? '',
          reason: e.reason ?? '',
          categoryId: e.category_id,
          account: e.account,
          externalRef: e.external_ref,
          occurredOn: e.occurred_on,
          createdAt: e.created_at,
        }),
      );
    },

    async loadCategories() {
      const { data, error } = await db
        .schema(CASH)
        .from('categories')
        .select('id, name, status')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });
      if (error) fail('carregar as categorias', error);
      return ((data ?? []) as CategoryDb[]).map(
        (c): Category => ({ id: c.id, name: c.name, status: c.status }),
      );
    },

    async createEntry(input) {
      const { data, error } = await db
        .schema(CASH)
        .from('entries')
        .insert({
          tenant_id: tenantId,
          kind: input.kind,
          amount_cents: input.amountCents,
          currency: input.currency,
          description: input.description,
          reason: input.reason,
          category_id: input.categoryId,
          account: input.account,
          occurred_on: input.occurredOn,
        })
        .select('id')
        .single();
      if (error) fail('lançar no livro-caixa', error);
      return { entryId: (data as { id: string }).id };
    },

    async createCategory(input) {
      const { data, error } = await db
        .schema(CASH)
        .from('categories')
        .insert({ tenant_id: tenantId, name: input.name })
        .select('id')
        .single();
      if (error) fail('criar a categoria', error);
      return { categoryId: (data as { id: string }).id };
    },

    async setCategoryStatus(input) {
      const { error } = await db
        .schema(CASH)
        .from('categories')
        .update({ status: input.status })
        .eq('id', input.categoryId)
        .eq('tenant_id', tenantId);
      if (error) fail('mudar o estado da categoria', error);
    },
  };
}
