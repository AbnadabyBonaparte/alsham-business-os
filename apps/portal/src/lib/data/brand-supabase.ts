import type { SupabaseClient } from '@supabase/supabase-js';

import type { BrandContext } from '@alsham/ai';

import { DataPortError } from './port';
import type { BrandPort } from './brand-port';

const CORE = 'core';

export function createBrandSupabasePort(db: SupabaseClient, tenantId: string): BrandPort {
  return {
    kind: 'supabase',

    async load() {
      const { data, error } = await db
        .schema(CORE)
        .from('ai_brand_context')
        .select('identity, tone, forbidden')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (error) throw new DataPortError('Não foi possível carregar o contexto da marca.', { cause: error });
      return {
        identity: (data?.identity as string) ?? '',
        tone: (data?.tone as string) ?? '',
        forbidden: (data?.forbidden as string[]) ?? [],
      };
    },

    async canEdit() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .eq('permission_key', 'core.tenant.manage');
      if (error) return false;
      return (data ?? []).length > 0;
    },

    async save(input: BrandContext) {
      const { error } = await db
        .schema(CORE)
        .from('ai_brand_context')
        .upsert(
          {
            tenant_id: tenantId,
            identity: input.identity,
            tone: input.tone,
            forbidden: [...input.forbidden],
          },
          { onConflict: 'tenant_id' },
        );
      if (error) {
        if ((error as { code?: string }).code === '42501') {
          throw new DataPortError(
            'Definir o contexto da marca exige a permissão core.tenant.manage.',
            { cause: error },
          );
        }
        throw new DataPortError('Não foi possível salvar o contexto da marca.', { cause: error });
      }
    },
  };
}
