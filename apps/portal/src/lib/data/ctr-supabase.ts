import type { SupabaseClient } from '@supabase/supabase-js';

import type { Adjustment, ContractStatus, Renewal } from '@alsham/contracts';

import { DataPortError } from './port';
import type { ContractRow, CtrPort } from './ctr-port';

const CTR = 'ctr';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface ContractDb {
  id: string;
  external_ref: string;
  title: string;
  description: string;
  contract_type: string | null;
  counterparty_name: string | null;
  counterparty_tax_id: string | null;
  party_id: string | null;
  starts_on: string | null;
  ends_on: string | null;
  value_cents: number | null;
  currency: string | null;
  status: ContractStatus;
  outcome_reason: string;
  decided_at: string | null;
  created_at: string;
}

interface AdjustmentDb {
  id: string;
  contract_id: string;
  adjusted_on: string;
  index_name: string;
  previous_value_cents: number;
  new_value_cents: number;
  note: string;
  registered_at: string;
}

interface RenewalDb {
  id: string;
  contract_id: string;
  previous_ends_on: string;
  new_ends_on: string;
  note: string;
  renewed_at: string;
}

export function createCtrSupabasePort(db: SupabaseClient, tenantId: string): CtrPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'ctr.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadContracts() {
      const { data, error } = await db
        .schema(CTR)
        .from('contracts')
        .select(
          'id, external_ref, title, description, contract_type, counterparty_name, counterparty_tax_id, party_id, starts_on, ends_on, value_cents, currency, status, outcome_reason, decided_at, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) fail('carregar a carteira de contratos', error);
      return ((data ?? []) as ContractDb[]).map(
        (c): ContractRow => ({
          id: c.id,
          externalRef: c.external_ref,
          title: c.title,
          description: c.description ?? '',
          contractType: c.contract_type,
          counterpartyName: c.counterparty_name,
          counterpartyTaxId: c.counterparty_tax_id,
          partyId: c.party_id,
          startsOn: c.starts_on,
          endsOn: c.ends_on,
          valueCents: c.value_cents === null ? null : Number(c.value_cents),
          currency: c.currency,
          status: c.status,
          outcomeReason: c.outcome_reason ?? '',
          decidedAt: c.decided_at,
          createdAt: c.created_at,
        }),
      );
    },

    async loadAdjustments() {
      const { data, error } = await db
        .schema(CTR)
        .from('adjustments')
        .select('id, contract_id, adjusted_on, index_name, previous_value_cents, new_value_cents, note, registered_at')
        .eq('tenant_id', tenantId);
      if (error) fail('carregar o livro de reajustes', error);
      return ((data ?? []) as AdjustmentDb[]).map(
        (a): Adjustment => ({
          id: a.id,
          contractId: a.contract_id,
          adjustedOn: a.adjusted_on,
          indexName: a.index_name,
          previousValueCents: Number(a.previous_value_cents),
          newValueCents: Number(a.new_value_cents),
          note: a.note ?? '',
          registeredAt: a.registered_at,
        }),
      );
    },

    async loadRenewals() {
      const { data, error } = await db
        .schema(CTR)
        .from('renewals')
        .select('id, contract_id, previous_ends_on, new_ends_on, note, renewed_at')
        .eq('tenant_id', tenantId);
      if (error) fail('carregar o livro de renovações', error);
      return ((data ?? []) as RenewalDb[]).map(
        (r): Renewal => ({
          id: r.id,
          contractId: r.contract_id,
          previousEndsOn: r.previous_ends_on,
          newEndsOn: r.new_ends_on,
          note: r.note ?? '',
          renewedAt: r.renewed_at,
        }),
      );
    },

    async createContract(input) {
      const { data, error } = await db
        .schema(CTR)
        .from('contracts')
        .insert({
          tenant_id: tenantId,
          external_ref: input.externalRef,
          title: input.title,
          description: input.description,
          contract_type: input.contractType,
          counterparty_name: input.counterpartyName,
          counterparty_tax_id: input.counterpartyTaxId,
          starts_on: input.startsOn,
          ends_on: input.endsOn,
          value_cents: input.valueCents,
          currency: input.currency,
        })
        .select('id')
        .single();
      if (error) fail('registrar o contrato', error);
      return { contractId: (data as { id: string }).id };
    },

    async setStatus(input) {
      const patch: Record<string, unknown> = { status: input.status };
      if (input.reason !== undefined) patch.outcome_reason = input.reason;
      const { error } = await db
        .schema(CTR)
        .from('contracts')
        .update(patch)
        .eq('id', input.contractId)
        .eq('tenant_id', tenantId);
      if (error) fail('mudar o estado do contrato', error);
    },

    async registerAdjustment(input) {
      const { error } = await db.schema(CTR).rpc('register_adjustment', {
        p_contract_id: input.contractId,
        p_adjusted_on: input.adjustedOn,
        p_index_name: input.indexName,
        p_new_value_cents: input.newValueCents,
        p_note: input.note,
      });
      if (error) fail('registrar o reajuste', error);
    },

    async renewContract(input) {
      const { error } = await db.schema(CTR).rpc('renew_contract', {
        p_contract_id: input.contractId,
        p_new_ends_on: input.newEndsOn,
        p_note: input.note,
      });
      if (error) fail('renovar o contrato', error);
    },
  };
}
