import type { SupabaseClient } from '@supabase/supabase-js';

import { DataPortError } from './port';
import type { MallPort, MallStoreRow } from './mall-port';

const MALL = 'mall';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface StoreDb {
  id: string;
  store_name: string;
  segment: string | null;
  space_name: string | null;
  status: 'active' | 'archived';
}

export function createMallSupabasePort(db: SupabaseClient, tenantId: string): MallPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'mall.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadStores() {
      const { data, error } = await db
        .schema(MALL)
        .from('stores')
        .select('id, store_name, segment, space_name, status')
        .eq('tenant_id', tenantId)
        .order('store_name', { ascending: true });
      if (error) fail('carregar os lojistas', error);
      return ((data ?? []) as StoreDb[]).map(
        (s): MallStoreRow => ({
          id: s.id,
          storeName: s.store_name,
          segment: s.segment ?? '',
          spaceName: s.space_name ?? '',
          status: s.status,
        }),
      );
    },
  };
}
