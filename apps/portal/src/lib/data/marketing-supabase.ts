import type { SupabaseClient } from '@supabase/supabase-js';

import { DEFAULT_SETTINGS } from '@alsham/marketing';
import type { Campaign, MarketingSettings, SpendApproval } from '@alsham/marketing';

import { DataPortError } from './port';
import type { MarketingPort } from './marketing-port';

/**
 * Adapter REAL do Módulo 2 — fala com o Supabase **como o usuário**, sob RLS.
 *
 * ⛔ **A `service_role key` não aparece neste arquivo, e não pode aparecer.**
 * Consequência visível: não existe aqui nenhuma escrita em
 * `marketing.spend_approvals`. Aquela tabela não tem policy de INSERT para
 * `authenticated`, e é o correio — do servidor, com `service_role` — que a
 * preenche. Se este arquivo tentasse gravar lá, a RLS recusaria, e é assim
 * que se quer.
 *
 * ⚠️ Zero regra de negócio. Traduz linha de banco em tipo do domínio e volta.
 * Nem a passagem de estado é decidida aqui: `applyTransition` recebe os
 * carimbos que `planTransition()` já calculou.
 *
 * O `tenantId` chega resolvido da sessão (`lib/session.ts`) — nunca da URL.
 */

const MARKETING = 'marketing';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface CampaignRow {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  status: Campaign['status'];
  scheduled_for: string | null;
  published_at: string | null;
  completed_at: string | null;
  budget_planned_cents: number | null;
  currency: string | null;
  budget_ref: string | null;
  budget_status: Campaign['budgetStatus'];
  audience_note: string;
}

function toCampaign(r: CampaignRow): Campaign {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    name: r.name,
    description: r.description ?? '',
    status: r.status,
    scheduledFor: r.scheduled_for,
    publishedAt: r.published_at,
    completedAt: r.completed_at,
    budgetPlannedCents: r.budget_planned_cents,
    currency: r.currency,
    budgetRef: r.budget_ref,
    budgetStatus: r.budget_status,
    audienceNote: r.audience_note ?? '',
  };
}

export function createMarketingSupabasePort(
  db: SupabaseClient,
  tenantId: string,
): MarketingPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'marketing.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r) => r.permission_key as string));
    },

    async loadSettings(): Promise<MarketingSettings> {
      const { data, error } = await db
        .schema(CORE)
        .from('tenant_modules')
        .select('settings')
        .eq('tenant_id', tenantId)
        .eq('module_id', 'marketing')
        .maybeSingle();
      if (error) fail('carregar a configuração do módulo', error);

      const raw = ((data?.settings ?? {}) as Record<string, unknown>).publishing as
        | Record<string, unknown>
        | undefined;

      // ⚠️ Aqui, ao contrário do limiar de conciliação, o default do PRODUTO é
      // legítimo e está declarado no pacote: não exigir aprovação de verba. A
      // diferença é que ausência de configuração aqui significa "sem
      // burocracia", que é uma resposta; lá significaria chutar um limiar, que
      // seria decidir a política do tenant por ele.
      return {
        requireBudgetClearance:
          typeof raw?.requireBudgetClearance === 'boolean'
            ? raw.requireBudgetClearance
            : DEFAULT_SETTINGS.requireBudgetClearance,
        requireFutureSchedule:
          typeof raw?.requireFutureSchedule === 'boolean'
            ? raw.requireFutureSchedule
            : DEFAULT_SETTINGS.requireFutureSchedule,
      };
    },

    async loadCampaigns() {
      const { data, error } = await db
        .schema(MARKETING)
        .from('campaigns')
        .select(
          'id, tenant_id, name, description, status, scheduled_for, published_at, completed_at, budget_planned_cents, currency, budget_ref, budget_status, audience_note',
        )
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) fail('carregar as campanhas', error);
      return (data ?? []).map((r) => toCampaign(r as unknown as CampaignRow));
    },

    async loadSpendApprovals(): Promise<SpendApproval[]> {
      const { data, error } = await db
        .schema(MARKETING)
        .from('spend_approvals')
        .select(
          'id, tenant_id, source_module_id, external_ref, decision, amount_cents, currency, decided_at, received_at',
        )
        .order('received_at', { ascending: false })
        .limit(200);
      if (error) fail('carregar as decisões de verba', error);
      return (data ?? []).map((r) => {
        const row = r as unknown as {
          id: string;
          tenant_id: string;
          source_module_id: string;
          external_ref: string;
          decision: 'approved' | 'rejected';
          amount_cents: number | null;
          currency: string | null;
          decided_at: string | null;
          received_at: string;
        };
        return {
          id: row.id,
          tenantId: row.tenant_id,
          sourceModuleId: row.source_module_id,
          externalRef: row.external_ref,
          decision: row.decision,
          amountCents: row.amount_cents,
          currency: row.currency,
          decidedAt: row.decided_at,
          receivedAt: row.received_at,
        };
      });
    },

    async createDraft(input) {
      const { data, error } = await db
        .schema(MARKETING)
        .from('campaigns')
        .insert({
          tenant_id: tenantId,
          name: input.name,
          description: input.description,
          audience_note: input.audienceNote,
          scheduled_for: input.scheduledFor,
          budget_planned_cents: input.budgetPlannedCents,
          currency: input.currency,
          budget_ref: input.budgetRef,
        })
        .select('id')
        .single();
      if (error) fail('criar a campanha', error);
      return { campaignId: (data as { id: string }).id };
    },

    async applyTransition(input) {
      // Só os carimbos que a decisão do pacote produziu. Nada é calculado aqui.
      const patch: Record<string, unknown> = { status: input.status };
      if (input.publishedAt) patch.published_at = input.publishedAt;
      if (input.completedAt) patch.completed_at = input.completedAt;

      const { error } = await db
        .schema(MARKETING)
        .from('campaigns')
        .update(patch)
        .eq('id', input.campaignId)
        // Cinto: o `tenant_id` da sessão também no WHERE. A RLS já barraria,
        // mas errar em silêncio numa linha de outro tenant é o tipo de bug
        // que ninguém vê acontecer.
        .eq('tenant_id', tenantId);

      // O trigger `campaigns_guard_publish` levanta 42501 quando falta a
      // permissão de publicar. Mensagem própria: o operador precisa saber que
      // é permissão, não pane.
      if (error) {
        if ((error as { code?: string }).code === '42501') {
          throw new DataPortError(
            'Você não tem a permissão marketing.campaign.publish para mudar o estado desta campanha.',
            { cause: error },
          );
        }
        fail('atualizar a campanha', error);
      }
    },
  };
}
