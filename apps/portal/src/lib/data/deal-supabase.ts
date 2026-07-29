import type { SupabaseClient } from '@supabase/supabase-js';

import type { FunnelStatus, NewOpportunity, OpportunityStatus } from '@alsham/deals';

import { DataPortError } from './port';
import type { DealPort, FunnelWithStages, OpportunityRow } from './deal-port';

const DEAL = 'deal';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface FunnelDb {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  status: FunnelStatus;
}

interface StageDb {
  id: string;
  funnel_id: string;
  position: number;
  name: string;
}

interface OpportunityDb {
  id: string;
  tenant_id: string;
  funnel_id: string;
  current_stage_id: string | null;
  title: string;
  description: string;
  value_cents: number | null;
  currency: string | null;
  probability: number | null;
  expected_close_date: string | null;
  party_id: string | null;
  party_name: string | null;
  tags: string[];
  status: OpportunityStatus;
  outcome_reason: string;
  created_at: string;
}

export function createDealSupabasePort(db: SupabaseClient, tenantId: string): DealPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'deal.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadFunnels() {
      const { data: funnels, error } = await db
        .schema(DEAL)
        .from('funnels')
        .select('id, tenant_id, name, description, status')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true });
      if (error) fail('carregar os funis', error);

      const rows = (funnels ?? []) as FunnelDb[];
      if (rows.length === 0) return [];

      const { data: stages, error: stagesErr } = await db
        .schema(DEAL)
        .from('funnel_stages')
        .select('id, funnel_id, position, name')
        .eq('tenant_id', tenantId);
      if (stagesErr) fail('carregar os estágios', stagesErr);

      const byFunnel = new Map<string, StageDb[]>();
      for (const raw of stages ?? []) {
        const s = raw as StageDb;
        const list = byFunnel.get(s.funnel_id) ?? [];
        list.push(s);
        byFunnel.set(s.funnel_id, list);
      }

      return rows.map(
        (f): FunnelWithStages => ({
          funnel: {
            id: f.id,
            tenantId: f.tenant_id,
            name: f.name,
            description: f.description ?? '',
            status: f.status,
          },
          stages: (byFunnel.get(f.id) ?? [])
            .sort((a, b) => a.position - b.position)
            .map((s) => ({
              id: s.id,
              funnelId: s.funnel_id,
              position: s.position,
              name: s.name,
            })),
        }),
      );
    },

    async loadOpportunities() {
      const { data, error } = await db
        .schema(DEAL)
        .from('opportunities')
        .select(
          'id, tenant_id, funnel_id, current_stage_id, title, description, value_cents, currency, probability, expected_close_date, party_id, party_name, tags, status, outcome_reason, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) fail('carregar as negociações', error);
      return ((data ?? []) as OpportunityDb[]).map(
        (o): OpportunityRow => ({
          id: o.id,
          tenantId: o.tenant_id,
          funnelId: o.funnel_id,
          currentStageId: o.current_stage_id,
          title: o.title,
          description: o.description ?? '',
          valueCents: o.value_cents === null ? null : Number(o.value_cents),
          currency: o.currency,
          probability: o.probability === null ? null : Number(o.probability),
          expectedCloseDate: o.expected_close_date,
          partyId: o.party_id,
          partyName: o.party_name,
          tags: o.tags ?? [],
          status: o.status,
          outcomeReason: o.outcome_reason ?? '',
          createdAt: o.created_at,
        }),
      );
    },

    async createFunnel(input) {
      const { data, error } = await db
        .schema(DEAL)
        .from('funnels')
        .insert({ tenant_id: tenantId, name: input.name, description: input.description })
        .select('id')
        .single();
      if (error) fail('criar o funil', error);
      const funnelId = (data as { id: string }).id;

      const { error: stagesErr } = await db.schema(DEAL).from('funnel_stages').insert(
        input.stages.map((s) => ({
          tenant_id: tenantId,
          funnel_id: funnelId,
          position: s.position,
          name: s.name,
        })),
      );
      if (stagesErr) fail('criar os estágios do funil', stagesErr);

      return { funnelId };
    },

    async createOpportunity(input: NewOpportunity) {
      // A negociação nasce no PRIMEIRO estágio do funil dela.
      const { data: first, error: firstErr } = await db
        .schema(DEAL)
        .from('funnel_stages')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('funnel_id', input.funnelId)
        .order('position', { ascending: true })
        .limit(1)
        .single();
      if (firstErr) fail('encontrar o estágio inicial do funil', firstErr);

      const { data, error } = await db
        .schema(DEAL)
        .from('opportunities')
        .insert({
          tenant_id: tenantId,
          funnel_id: input.funnelId,
          current_stage_id: (first as { id: string }).id,
          title: input.title,
          description: input.description ?? '',
          value_cents: input.valueCents ?? null,
          currency: input.currency ?? null,
          probability: input.probability ?? null,
          expected_close_date: input.expectedCloseDate ?? null,
          party_id: input.partyId ?? null,
          party_name: input.partyName ?? null,
          tags: input.tags ?? [],
        })
        .select('id')
        .single();
      if (error) fail('abrir a negociação', error);
      return { opportunityId: (data as { id: string }).id };
    },

    async moveOpportunity(input) {
      const { error } = await db.schema(DEAL).rpc('move_opportunity', {
        p_opportunity_id: input.opportunityId,
        p_to_stage_id: input.toStageId,
        p_note: input.note,
      });
      if (error) fail('mover a negociação', error);
    },

    async closeOpportunity(input) {
      const { error } = await db.schema(DEAL).rpc('close_opportunity', {
        p_opportunity_id: input.opportunityId,
        p_outcome: input.outcome,
        p_reason: input.reason,
      });
      if (error) fail('encerrar a negociação', error);
    },
  };
}
