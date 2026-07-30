import type { SupabaseClient } from '@supabase/supabase-js';

import type { LineKind, LineStatus } from '@alsham/dre';

import { DataPortError } from './port';
import type { DreLineRow, DrePort, DreResultRow, DreStatementRow } from './dre-port';

const DRE = 'dre';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

export function createDreSupabasePort(db: SupabaseClient, tenantId: string): DrePort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'dre.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadLines() {
      const { data, error } = await db
        .schema(DRE)
        .from('lines')
        .select('id, name, kind, match_category, position, currency, status, created_at')
        .eq('tenant_id', tenantId)
        .order('position');
      if (error) fail('carregar o plano', error);
      return (
        (data ?? []) as {
          id: string; name: string; kind: LineKind; match_category: string;
          position: number; currency: string; status: LineStatus; created_at: string;
        }[]
      ).map((l): DreLineRow => ({
        id: l.id, name: l.name, kind: l.kind, matchCategory: l.match_category,
        position: l.position, currency: l.currency, status: l.status, createdAt: l.created_at,
      }));
    },

    async loadStatement() {
      const { data, error } = await db
        .schema(DRE)
        .from('statement')
        .select('line_id, line_name, kind, position, currency, competence_month, amount_cents, entry_count')
        .eq('tenant_id', tenantId)
        .order('competence_month', { ascending: false })
        .order('position');
      if (error) fail('carregar o demonstrativo', error);
      return (
        (data ?? []) as {
          line_id: string; line_name: string; kind: LineKind; position: number;
          currency: string; competence_month: string; amount_cents: number; entry_count: number;
        }[]
      ).map((s): DreStatementRow => ({
        lineId: s.line_id, lineName: s.line_name, kind: s.kind, position: s.position,
        currency: s.currency, competenceMonth: s.competence_month, amountCents: s.amount_cents,
        entryCount: s.entry_count,
      }));
    },

    async loadResult() {
      const { data, error } = await db
        .schema(DRE)
        .from('result')
        .select('currency, competence_month, revenue_cents, cost_cents, expense_cents, result_cents')
        .eq('tenant_id', tenantId)
        .order('competence_month', { ascending: false });
      if (error) fail('carregar o resultado', error);
      return (
        (data ?? []) as {
          currency: string; competence_month: string; revenue_cents: number;
          cost_cents: number; expense_cents: number; result_cents: number;
        }[]
      ).map((r): DreResultRow => ({
        currency: r.currency, competenceMonth: r.competence_month, revenueCents: r.revenue_cents,
        costCents: r.cost_cents, expenseCents: r.expense_cents, resultCents: r.result_cents,
      }));
    },

    async createLine(input) {
      const { data, error } = await db
        .schema(DRE)
        .from('lines')
        .insert({
          tenant_id: tenantId, name: input.name, kind: input.kind,
          match_category: input.matchCategory, position: input.position, currency: input.currency,
        })
        .select('id')
        .single();
      if (error) fail('criar a linha', error);
      return { lineId: (data as { id: string }).id };
    },

    async setLineStatus(input) {
      const { error } = await db
        .schema(DRE).from('lines').update({ status: input.status })
        .eq('id', input.lineId).eq('tenant_id', tenantId);
      if (error) fail('mover a linha', error);
    },
  };
}
