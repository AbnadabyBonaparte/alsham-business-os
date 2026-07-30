import type { SupabaseClient } from '@supabase/supabase-js';

import type { CenterStatus, RuleLine, RuleStatus } from '@alsham/cost-centers';

import { DataPortError } from './port';
import type { ByCenterRow, CcPort, CenterRow, ExecutionRow, RuleRow } from './cc-port';

const CC = 'cc';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

export function createCcSupabasePort(db: SupabaseClient, tenantId: string): CcPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'cc.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadCenters() {
      const { data, error } = await db
        .schema(CC)
        .from('centers')
        .select('id, name, status, created_at')
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) fail('carregar os centros', error);
      return ((data ?? []) as { id: string; name: string; status: CenterStatus; created_at: string }[]).map(
        (c): CenterRow => ({ id: c.id, name: c.name, status: c.status, createdAt: c.created_at }),
      );
    },

    async loadRules() {
      const { data, error } = await db
        .schema(CC)
        .from('rules')
        .select('id, name, status, created_at, rule_lines(center_id, basis_points)')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) fail('carregar as regras', error);
      return (
        (data ?? []) as {
          id: string;
          name: string;
          status: RuleStatus;
          created_at: string;
          rule_lines: { center_id: string; basis_points: number }[] | null;
        }[]
      ).map(
        (r): RuleRow => ({
          id: r.id,
          name: r.name,
          status: r.status,
          createdAt: r.created_at,
          lines: (r.rule_lines ?? []).map(
            (l): RuleLine => ({ centerId: l.center_id, basisPoints: l.basis_points }),
          ),
        }),
      );
    },

    async loadExecutions() {
      const { data, error } = await db
        .schema(CC)
        .from('executions')
        .select('id, seq, rule_id, rule_name, source_kind, source_ref, source_name, total_cents, currency, competence_on, note, reason, executed_at')
        .eq('tenant_id', tenantId)
        .order('seq', { ascending: false });
      if (error) fail('carregar as execuções', error);
      return (
        (data ?? []) as {
          id: string; seq: number; rule_id: string; rule_name: string;
          source_kind: string; source_ref: string | null; source_name: string;
          total_cents: number; currency: string; competence_on: string;
          note: string; reason: string; executed_at: string;
        }[]
      ).map(
        (e): ExecutionRow => ({
          id: e.id, seq: e.seq, ruleId: e.rule_id, ruleName: e.rule_name,
          sourceKind: e.source_kind, sourceRef: e.source_ref, sourceName: e.source_name,
          totalCents: e.total_cents, currency: e.currency, competenceOn: e.competence_on,
          note: e.note, reason: e.reason, executedAt: e.executed_at,
        }),
      );
    },

    async loadByCenter() {
      const { data, error } = await db
        .schema(CC)
        .from('by_center')
        .select('center_id, center_name, currency, allocated_cents, allocation_count')
        .eq('tenant_id', tenantId);
      if (error) fail('carregar o rateado por centro', error);
      return ((data ?? []) as { center_id: string; center_name: string; currency: string; allocated_cents: number; allocation_count: number }[]).map(
        (r): ByCenterRow => ({
          centerId: r.center_id, centerName: r.center_name, currency: r.currency,
          allocatedCents: r.allocated_cents, allocationCount: r.allocation_count,
        }),
      );
    },

    async createCenter(input) {
      const { data, error } = await db
        .schema(CC).from('centers').insert({ tenant_id: tenantId, name: input.name })
        .select('id').single();
      if (error) fail('cadastrar o centro', error);
      return { centerId: (data as { id: string }).id };
    },

    async setCenterStatus(input) {
      const { error } = await db
        .schema(CC).from('centers').update({ status: input.status })
        .eq('id', input.centerId).eq('tenant_id', tenantId);
      if (error) fail('mover o centro', error);
    },

    async createRule(input) {
      const { data, error } = await db
        .schema(CC).from('rules').insert({ tenant_id: tenantId, name: input.name })
        .select('id').single();
      if (error) fail('criar a regra', error);
      return { ruleId: (data as { id: string }).id };
    },

    async addRuleLine(input) {
      const { error } = await db.schema(CC).from('rule_lines').insert({
        tenant_id: tenantId, rule_id: input.ruleId, center_id: input.centerId, basis_points: input.basisPoints,
      });
      if (error) fail('somar a linha à regra', error);
    },

    async removeRuleLine(input) {
      const { error } = await db
        .schema(CC).from('rule_lines').delete()
        .eq('tenant_id', tenantId).eq('rule_id', input.ruleId).eq('center_id', input.centerId);
      if (error) fail('tirar a linha da regra', error);
    },

    async setRuleStatus(input) {
      const { error } = await db
        .schema(CC).from('rules').update({ status: input.status })
        .eq('id', input.ruleId).eq('tenant_id', tenantId);
      if (error) fail('mover a regra', error);
    },

    async executeRateio(input) {
      const { error } = await db.schema(CC).rpc('execute_rateio', {
        p_rule_id: input.ruleId,
        p_source_kind: input.sourceKind,
        p_source_ref: null,
        p_source_name: input.sourceName,
        p_total_cents: input.totalCents,
        p_currency: input.currency,
        p_competence_on: input.competenceOn,
        p_note: input.note,
        p_reason: input.reason,
      });
      if (error) fail('executar o rateio', error);
    },
  };
}
