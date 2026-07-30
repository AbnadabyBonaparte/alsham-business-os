import type { SupabaseClient } from '@supabase/supabase-js';

import type { BudgetStatus } from '@alsham/budgets';

import { DataPortError } from './port';
import type { BudgetRow, BudPort } from './bud-port';

const BUD = 'bud';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

export function createBudSupabasePort(db: SupabaseClient, tenantId: string): BudPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'bud.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadBudgets() {
      // O orçamento e o realizado vêm de fontes distintas de propósito: a
      // trave da tabela, o realizado da VIEW calculada. Casam por id na tela.
      const { data, error } = await db
        .schema(BUD)
        .from('budgets')
        .select('id, name, category, starts_on, ends_on, limit_cents, currency, status, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) fail('carregar os orçamentos', error);

      const { data: real, error: errReal } = await db
        .schema(BUD)
        .from('budget_realized')
        .select('budget_id, realized_cents, remaining_cents, movement_count')
        .eq('tenant_id', tenantId);
      if (errReal) fail('carregar o realizado', errReal);

      const porId = new Map(
        ((real ?? []) as { budget_id: string; realized_cents: number; remaining_cents: number; movement_count: number }[]).map(
          (r) => [r.budget_id, r] as const,
        ),
      );

      return (
        (data ?? []) as {
          id: string; name: string; category: string; starts_on: string; ends_on: string;
          limit_cents: number; currency: string; status: BudgetStatus; created_at: string;
        }[]
      ).map((b): BudgetRow => {
        const r = porId.get(b.id);
        return {
          id: b.id,
          name: b.name,
          category: b.category,
          startsOn: b.starts_on,
          endsOn: b.ends_on,
          limitCents: b.limit_cents,
          currency: b.currency,
          status: b.status,
          createdAt: b.created_at,
          realizedCents: r?.realized_cents ?? 0,
          remainingCents: r?.remaining_cents ?? b.limit_cents,
          movementCount: r?.movement_count ?? 0,
        };
      });
    },

    async createBudget(input) {
      const { data, error } = await db
        .schema(BUD)
        .from('budgets')
        .insert({
          tenant_id: tenantId,
          name: input.name,
          category: input.category,
          starts_on: input.startsOn,
          ends_on: input.endsOn,
          limit_cents: input.limitCents,
          currency: input.currency,
        })
        .select('id')
        .single();
      if (error) fail('criar o orçamento', error);
      return { budgetId: (data as { id: string }).id };
    },

    async renameBudget(input) {
      const { error } = await db
        .schema(BUD)
        .from('budgets')
        .update({ name: input.name })
        .eq('id', input.budgetId)
        .eq('tenant_id', tenantId);
      if (error) fail('renomear o orçamento', error);
    },

    async setBudgetStatus(input) {
      const { error } = await db
        .schema(BUD)
        .from('budgets')
        .update({ status: input.status })
        .eq('id', input.budgetId)
        .eq('tenant_id', tenantId);
      if (error) fail('mover o orçamento', error);
    },
  };
}
