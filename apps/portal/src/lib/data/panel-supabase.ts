import type { SupabaseClient } from '@supabase/supabase-js';

import { buildShelf } from '@alsham/permissions';
import type { CatalogEntry, ShelfItem, TenantModuleRow } from '@alsham/permissions';

import { DataPortError } from './port';
import type { AuditRow, CourierSummary, PanelPort, PlanUsageRow } from './panel-port';

/**
 * O adapter REAL do Painel — tudo sob RLS, como o usuário.
 *
 * ⛔ **Nenhuma leitura global.** A saúde do correio vem de
 * `core.tenant_courier_summary()`, que devolve o veredito e **só os números
 * deste tenant** — a `core.courier_status()` continua fechada. Ver
 * `0021_tenant_panel.sql`.
 *
 * ⚠️ Zero regra de negócio: quem cruza catálogo com instalado é `buildShelf()`,
 * no pacote.
 */
export function createPanelSupabasePort(
  db: SupabaseClient,
  tenantId: string,
  planCode: string,
): PanelPort {
  return {
    kind: 'supabase',
    planCode,

    async loadCourier(): Promise<CourierSummary | null> {
      const { data, error } = await db
        .schema('core')
        .rpc('tenant_courier_summary', { p_tenant_id: tenantId });
      // ⚠️ Painel não derrama erro: sem resposta, a seção diz que não conseguiu
      // ler — nunca inventa "OK". Um veredito falso é pior do que nenhum.
      if (error) return null;
      const linha = (data as unknown[] | null)?.[0] as
        | {
            veredito: CourierSummary['veredito'];
            detalhe: string;
            meus_pendentes: number;
            meus_mortos: number;
            meu_atraso_min: number;
          }
        | undefined;
      if (linha === undefined) return null;
      return {
        veredito: linha.veredito,
        detalhe: linha.detalhe,
        meusPendentes: Number(linha.meus_pendentes),
        meusMortos: Number(linha.meus_mortos),
        meuAtrasoMin: Number(linha.meu_atraso_min),
      };
    },

    async loadPlanUsage(): Promise<PlanUsageRow[]> {
      const { data, error } = await db
        .schema('core')
        .rpc('tenant_plan_usage', { p_tenant_id: tenantId });
      if (error) throw new DataPortError('Não foi possível ler o consumo do plano.', { cause: error });
      return ((data ?? []) as {
        metric: string;
        limit_value: number | null;
        used: number;
        on_exceed: string;
      }[]).map((r) => ({
        metric: r.metric,
        limit: r.limit_value === null ? null : Number(r.limit_value),
        used: Number(r.used),
        onExceed: r.on_exceed === 'meter' ? 'meter' : 'block',
      }));
    },

    async loadRecentAudit(): Promise<AuditRow[]> {
      const { data, error } = await db
        .schema('core')
        .from('audit_log')
        .select('id, action, resource_type, module_id, occurred_at, actor_kind')
        .order('occurred_at', { ascending: false })
        .limit(12);
      // A trilha exige `core.audit.read`. Sem ela, lista vazia — e a tela diz
      // por quê, em vez de mostrar erro.
      if (error) return [];
      return ((data ?? []) as {
        id: string;
        action: string;
        resource_type: string;
        module_id: string | null;
        occurred_at: string;
        actor_kind: AuditRow['actorKind'];
      }[]).map((r) => ({
        id: r.id,
        action: r.action,
        resourceType: r.resource_type,
        moduleId: r.module_id,
        occurredAt: r.occurred_at,
        actorKind: r.actor_kind,
      }));
    },

    async loadShelf(): Promise<ShelfItem[]> {
      const [{ data: cat, error: e1 }, { data: inst, error: e2 }] = await Promise.all([
        db.schema('core').from('module_registry').select('*'),
        db.schema('core').from('tenant_modules').select('module_id, status, version, installed_at'),
      ]);
      if (e1) throw new DataPortError('Não foi possível ler o catálogo.', { cause: e1 });
      if (e2) throw new DataPortError('Não foi possível ler os módulos instalados.', { cause: e2 });

      const catalogo: CatalogEntry[] = ((cat ?? []) as Record<string, unknown>[]).map((r) => ({
        moduleId: r.module_id as string,
        name: r.name as string,
        version: r.version as string,
        summary: r.summary as string,
        layer: r.layer as 'domain' | 'vertical',
        domainKey: (r.domain_key as string | null) ?? null,
        verticalKey: (r.vertical_key as string | null) ?? null,
        capabilities: (r.capabilities as CatalogEntry['capabilities']) ?? [],
        permissions: (r.permissions as CatalogEntry['permissions']) ?? [],
        emits: (r.events_emits as CatalogEntry['emits']) ?? [],
        consumes: (r.events_consumes as CatalogEntry['consumes']) ?? [],
      }));

      const instalados: TenantModuleRow[] = ((inst ?? []) as Record<string, unknown>[]).map((r) => ({
        moduleId: r.module_id as string,
        status: r.status as TenantModuleRow['status'],
        version: r.version as string,
        installedAt: r.installed_at as string,
      }));

      return [...buildShelf(catalogo, instalados)];
    },
  };
}
