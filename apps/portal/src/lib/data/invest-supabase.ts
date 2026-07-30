import type { SupabaseClient } from '@supabase/supabase-js';

import type { HoldingStatus } from '@alsham/investments';

import { DataPortError } from './port';
import type { HoldingRow, InvestPort, PositionRow } from './invest-port';

const INVEST = 'invest';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

export function createInvestSupabasePort(db: SupabaseClient, tenantId: string): InvestPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'invest.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadHoldings() {
      const { data, error } = await db
        .schema(INVEST)
        .from('holdings')
        .select('id, name, kind, institution, currency, status, created_at')
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) fail('carregar os investimentos', error);
      return (
        (data ?? []) as {
          id: string; name: string; kind: string; institution: string;
          currency: string; status: HoldingStatus; created_at: string;
        }[]
      ).map((h): HoldingRow => ({
        id: h.id, name: h.name, kind: h.kind, institution: h.institution,
        currency: h.currency, status: h.status, createdAt: h.created_at,
      }));
    },

    async loadPositions() {
      const { data, error } = await db
        .schema(INVEST)
        .from('positions')
        .select('holding_id, holding_name, currency, position_cents, invested_cents, yield_cents, redeemed_cents, movement_count')
        .eq('tenant_id', tenantId);
      if (error) fail('carregar as posições', error);
      return (
        (data ?? []) as {
          holding_id: string; holding_name: string; currency: string;
          position_cents: number; invested_cents: number; yield_cents: number;
          redeemed_cents: number; movement_count: number;
        }[]
      ).map((p): PositionRow => ({
        holdingId: p.holding_id, holdingName: p.holding_name, currency: p.currency,
        positionCents: p.position_cents, investedCents: p.invested_cents, yieldCents: p.yield_cents,
        redeemedCents: p.redeemed_cents, movementCount: p.movement_count,
      }));
    },

    async createHolding(input) {
      const { data, error } = await db
        .schema(INVEST)
        .from('holdings')
        .insert({ tenant_id: tenantId, name: input.name, kind: input.kind, institution: input.institution, currency: input.currency })
        .select('id')
        .single();
      if (error) fail('cadastrar o investimento', error);
      return { holdingId: (data as { id: string }).id };
    },

    async setHoldingStatus(input) {
      const { error } = await db
        .schema(INVEST).from('holdings').update({ status: input.status })
        .eq('id', input.holdingId).eq('tenant_id', tenantId);
      if (error) fail('mover o investimento', error);
    },

    async registerMovement(input) {
      const { error } = await db.schema(INVEST).from('movements').insert({
        tenant_id: tenantId,
        holding_id: input.holdingId,
        kind: input.kind,
        amount_cents: input.amountCents,
        currency: input.currency,
        note: input.note,
        occurred_on: input.occurredOn,
      });
      if (error) fail('registrar o ato', error);
    },
  };
}
