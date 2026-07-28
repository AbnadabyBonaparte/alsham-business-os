import type { SupabaseClient } from '@supabase/supabase-js';

import type { CatalogEntry, TenantModuleRow } from '@alsham/permissions';

import { DataPortError } from './port';
import type { StorePort } from './store-port';

/**
 * Adapter REAL da Store — fala com o Supabase **como o usuário**, sob RLS.
 *
 * ⛔ Sem `service_role`. Instalar módulo é ato do cliente, com a sessão dele:
 * a permissão é conferida dentro de `core.install_module()`, na primeira
 * linha. Usar a chave-mãe aqui trocaria uma checagem real por uma confiança.
 *
 * ⚠️ Zero regra de negócio. Traduz linha em tipo e chama duas funções.
 */

const CORE = 'core';

interface RegistryRow {
  module_id: string;
  name: string;
  version: string;
  summary: string;
  layer: 'domain' | 'vertical';
  domain_key: string | null;
  vertical_key: string | null;
  capabilities: unknown;
  permissions: unknown;
  events_emits: unknown;
  events_consumes: unknown;
}

function lista<T>(raw: unknown): T[] {
  return Array.isArray(raw) ? (raw as T[]) : [];
}

/**
 * Traduz o erro do banco em mensagem apresentável.
 *
 * ⭐ **A mensagem do banco é repassada literalmente**, e é decisão: as recusas
 * de `core.install_module()` foram escritas para o humano ler — "o tenant não
 * tem o papel X", "o plano permite N módulos". Trocá-las por um genérico
 * "não foi possível instalar" jogaria fora a única explicação que existe.
 *
 * O `stack` continua no log do servidor e não vai para a tela.
 */
function falhaDoBanco(erro: unknown, acao: string): never {
  const msg = (erro as { message?: string } | null)?.message;
  throw new DataPortError(msg && msg.trim().length > 0 ? msg : `Não foi possível ${acao}.`, {
    cause: erro,
  });
}

export function createStoreSupabasePort(db: SupabaseClient, tenantId: string): StorePort {
  return {
    kind: 'supabase',

    async loadCatalog(): Promise<CatalogEntry[]> {
      // Sem `.eq('status','published')`: a policy já garante isso, e depender
      // dela é o ponto. Se um dia a policy afrouxar, o CI acusa — a tela não
      // é a última linha de defesa.
      const { data, error } = await db
        .schema(CORE)
        .from('module_registry')
        .select(
          'module_id, name, version, summary, layer, domain_key, vertical_key, capabilities, permissions, events_emits, events_consumes',
        )
        .order('name');
      if (error) falhaDoBanco(error, 'carregar a vitrine');

      return (data ?? []).map((r) => {
        const row = r as unknown as RegistryRow;
        return {
          moduleId: row.module_id,
          name: row.name,
          version: row.version,
          summary: row.summary,
          layer: row.layer,
          domainKey: row.domain_key,
          verticalKey: row.vertical_key,
          capabilities: lista<{ key: string; canonicalName: string }>(row.capabilities),
          permissions: lista<{ key: string; description: string }>(row.permissions),
          emits: lista<{ type: string; description: string }>(row.events_emits),
          consumes: lista<{ type: string; description: string }>(row.events_consumes),
        };
      });
    },

    async loadTenantModules(): Promise<TenantModuleRow[]> {
      const { data, error } = await db
        .schema(CORE)
        .from('tenant_modules')
        .select('module_id, status, version, installed_at')
        .eq('tenant_id', tenantId);
      if (error) falhaDoBanco(error, 'carregar os módulos do tenant');

      return (data ?? []).map((r) => {
        const row = r as unknown as {
          module_id: string;
          status: TenantModuleRow['status'];
          version: string;
          installed_at: string;
        };
        return {
          moduleId: row.module_id,
          status: row.status,
          version: row.version,
          installedAt: row.installed_at,
        };
      });
    },

    async listCorePermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'core.%');
      if (error) falhaDoBanco(error, 'carregar suas permissões');
      return new Set((data ?? []).map((r) => r.permission_key as string));
    },

    async loadTenantRoles() {
      // ⚠️ `tenant_id` não nulo: papel de sistema não entra na lista, porque
      // conceder permissão de módulo a ele faria o módulo vazar para todos os
      // tenants. `core.install_module()` recusa de qualquer forma.
      const { data, error } = await db
        .schema(CORE)
        .from('roles')
        .select('key, name')
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) falhaDoBanco(error, 'carregar os papéis do tenant');
      return (data ?? []).map((r) => ({ key: r.key as string, name: r.name as string }));
    },

    async loadModuleLimit() {
      const { data, error } = await db
        .schema(CORE)
        .from('plan_limits')
        .select('limit_value, metric')
        .eq('metric', 'modules')
        .maybeSingle();
      // Não é falha de operação: sem limite configurado, a tela só não mostra
      // o número. Quem barra é a função de instalar.
      if (error) return null;
      const v = (data as { limit_value: number | null } | null)?.limit_value;
      return typeof v === 'number' ? v : null;
    },

    async install({ moduleId, roleKey }) {
      const { error } = await db.schema(CORE).rpc('install_module', {
        p_tenant_id: tenantId,
        p_module_id: moduleId,
        p_role_key: roleKey,
      });
      if (error) falhaDoBanco(error, 'instalar o módulo');
    },

    async uninstall({ moduleId }) {
      const { error } = await db.schema(CORE).rpc('uninstall_module', {
        p_tenant_id: tenantId,
        p_module_id: moduleId,
      });
      if (error) falhaDoBanco(error, 'desinstalar o módulo');
    },
  };
}
