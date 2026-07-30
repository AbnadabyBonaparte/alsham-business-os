import type { SupabaseClient } from '@supabase/supabase-js';

import type { AssetStatus, AssetTransfer, CategoryStatus, PatCategory } from '@alsham/assets';

import { DataPortError } from './port';
import type { AssetRow, PatPort } from './pat-port';

const PAT = 'pat';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface AssetDb {
  id: string;
  name: string;
  code: string;
  description: string;
  category_id: string | null;
  original_location: string;
  acquisition_cost_cents: number | null;
  currency: string | null;
  acquired_on: string | null;
  status: AssetStatus;
  written_off_at: string | null;
  write_off_reason: string;
  created_at: string;
}

interface TransferDb {
  id: string;
  asset_id: string;
  from_location: string;
  to_location: string;
  note: string;
  moved_at: string;
}

interface CategoryDb {
  id: string;
  name: string;
  status: CategoryStatus;
}

export function createPatSupabasePort(db: SupabaseClient, tenantId: string): PatPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'pat.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadAssets() {
      const { data, error } = await db
        .schema(PAT)
        .from('assets')
        .select(
          'id, name, code, description, category_id, original_location, acquisition_cost_cents, currency, acquired_on, status, written_off_at, write_off_reason, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) fail('carregar o livro de bens', error);
      return ((data ?? []) as AssetDb[]).map(
        (a): AssetRow => ({
          id: a.id,
          name: a.name,
          code: a.code,
          description: a.description ?? '',
          categoryId: a.category_id,
          originalLocation: a.original_location,
          acquisitionCostCents:
            a.acquisition_cost_cents === null ? null : Number(a.acquisition_cost_cents),
          currency: a.currency,
          acquiredOn: a.acquired_on,
          status: a.status,
          writtenOffAt: a.written_off_at,
          writeOffReason: a.write_off_reason ?? '',
          createdAt: a.created_at,
        }),
      );
    },

    async loadTransfers() {
      const { data, error } = await db
        .schema(PAT)
        .from('transfers')
        .select('id, asset_id, from_location, to_location, note, moved_at')
        .eq('tenant_id', tenantId)
        .order('moved_at', { ascending: false });
      if (error) fail('carregar o livro de transferências', error);
      return ((data ?? []) as TransferDb[]).map(
        (t): AssetTransfer => ({
          id: t.id,
          assetId: t.asset_id,
          fromLocation: t.from_location,
          toLocation: t.to_location,
          note: t.note ?? '',
          movedAt: t.moved_at,
        }),
      );
    },

    async loadCategories() {
      const { data, error } = await db
        .schema(PAT)
        .from('categories')
        .select('id, name, status')
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) fail('carregar as categorias', error);
      return ((data ?? []) as CategoryDb[]).map(
        (c): PatCategory => ({ id: c.id, name: c.name, status: c.status }),
      );
    },

    async createAsset(input) {
      const { data, error } = await db
        .schema(PAT)
        .from('assets')
        .insert({
          tenant_id: tenantId,
          name: input.name,
          code: input.code,
          description: input.description,
          category_id: input.categoryId,
          original_location: input.originalLocation,
          acquisition_cost_cents: input.acquisitionCostCents,
          currency: input.currency,
          acquired_on: input.acquiredOn,
        })
        .select('id')
        .single();
      if (error) fail('cadastrar o bem', error);
      return { assetId: (data as { id: string }).id };
    },

    async transferAsset(input) {
      // O "de onde" NÃO vai daqui: é o gatilho quem carimba.
      const { error } = await db.schema(PAT).from('transfers').insert({
        tenant_id: tenantId,
        asset_id: input.assetId,
        to_location: input.toLocation,
        note: input.note,
      });
      if (error) fail('registrar a transferência', error);
    },

    async writeOffAsset(input) {
      const { error } = await db
        .schema(PAT)
        .from('assets')
        .update({ status: 'written_off', write_off_reason: input.reason })
        .eq('id', input.assetId)
        .eq('tenant_id', tenantId);
      if (error) fail('baixar o bem', error);
    },

    async createCategory(input) {
      const { error } = await db
        .schema(PAT)
        .from('categories')
        .insert({ tenant_id: tenantId, name: input.name });
      if (error) fail('criar a categoria', error);
    },
  };
}
