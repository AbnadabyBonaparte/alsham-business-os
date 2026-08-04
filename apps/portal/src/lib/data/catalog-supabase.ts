import type { SupabaseClient } from '@supabase/supabase-js';

import { DataPortError } from './port';
import type { CatalogPort, CatalogProductRow } from './catalog-port';

const CATALOG = 'catalog';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface ProductDb {
  id: string;
  name: string;
  sku: string | null;
  price_cents: number;
  currency: string;
  status: string;
}

export function createCatalogSupabasePort(db: SupabaseClient, tenantId: string): CatalogPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'catalog.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadProducts() {
      const { data, error } = await db
        .schema(CATALOG)
        .from('products')
        .select('id, name, sku, price_cents, currency, status')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true });
      if (error) fail('carregar o catálogo de produtos', error);
      return ((data ?? []) as ProductDb[]).map(
        (p): CatalogProductRow => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          priceCents: Number(p.price_cents),
          currency: p.currency,
          status: p.status,
        }),
      );
    },
  };
}
