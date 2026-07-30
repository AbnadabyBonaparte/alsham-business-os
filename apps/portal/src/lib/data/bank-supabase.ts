import type { SupabaseClient } from '@supabase/supabase-js';

import type { AccountStatus, MovementKind } from '@alsham/bank-accounts';

import { DataPortError } from './port';
import type { AccountRow, BalanceRow, BankPort, MovementRow } from './bank-port';

const BANK = 'bank';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

export function createBankSupabasePort(db: SupabaseClient, tenantId: string): BankPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'bank.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadAccounts() {
      const { data, error } = await db
        .schema(BANK)
        .from('accounts')
        .select('id, name, bank_name, branch, account_number, currency, status, created_at')
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) fail('carregar as contas', error);
      return (
        (data ?? []) as {
          id: string; name: string; bank_name: string; branch: string; account_number: string;
          currency: string; status: AccountStatus; created_at: string;
        }[]
      ).map((a): AccountRow => ({
        id: a.id, name: a.name, bankName: a.bank_name, branch: a.branch, accountNumber: a.account_number,
        currency: a.currency, status: a.status, createdAt: a.created_at,
      }));
    },

    async loadBalances() {
      const { data, error } = await db
        .schema(BANK)
        .from('balances')
        .select('account_id, account_name, currency, balance_cents, inflow_cents, outflow_cents, movement_count')
        .eq('tenant_id', tenantId);
      if (error) fail('carregar os saldos', error);
      return (
        (data ?? []) as {
          account_id: string; account_name: string; currency: string;
          balance_cents: number; inflow_cents: number; outflow_cents: number; movement_count: number;
        }[]
      ).map((b): BalanceRow => ({
        accountId: b.account_id, accountName: b.account_name, currency: b.currency,
        balanceCents: b.balance_cents, inflowCents: b.inflow_cents, outflowCents: b.outflow_cents,
        movementCount: b.movement_count,
      }));
    },

    async loadMovements(input) {
      const { data, error } = await db
        .schema(BANK)
        .from('movements')
        .select('id, account_id, kind, amount_cents, signed_amount_cents, currency, description, reason, counterparty_name, external_ref, transfer_id, occurred_on, created_at')
        .eq('tenant_id', tenantId)
        .eq('account_id', input.accountId)
        .order('occurred_on', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) fail('carregar o livro da conta', error);
      return (
        (data ?? []) as {
          id: string; account_id: string; kind: MovementKind; amount_cents: number; signed_amount_cents: number;
          currency: string; description: string; reason: string; counterparty_name: string;
          external_ref: string | null; transfer_id: string | null; occurred_on: string; created_at: string;
        }[]
      ).map((m): MovementRow => ({
        id: m.id, accountId: m.account_id, kind: m.kind, amountCents: m.amount_cents,
        signedAmountCents: m.signed_amount_cents, currency: m.currency, description: m.description,
        reason: m.reason, counterpartyName: m.counterparty_name, externalRef: m.external_ref,
        transferId: m.transfer_id, occurredOn: m.occurred_on, createdAt: m.created_at,
      }));
    },

    async createAccount(input) {
      const { data, error } = await db
        .schema(BANK)
        .from('accounts')
        .insert({
          tenant_id: tenantId, name: input.name, bank_name: input.bankName,
          branch: input.branch, account_number: input.accountNumber, currency: input.currency,
        })
        .select('id')
        .single();
      if (error) fail('cadastrar a conta', error);
      return { accountId: (data as { id: string }).id };
    },

    async setAccountStatus(input) {
      const { error } = await db
        .schema(BANK).from('accounts').update({ status: input.status })
        .eq('id', input.accountId).eq('tenant_id', tenantId);
      if (error) fail('mover a conta', error);
    },

    async registerMovement(input) {
      const { error } = await db.schema(BANK).from('movements').insert({
        tenant_id: tenantId,
        account_id: input.accountId,
        kind: input.kind,
        amount_cents: Math.abs(input.amountCents),
        currency: input.currency,
        description: input.description,
        reason: input.reason,
        occurred_on: input.occurredOn,
      });
      if (error) fail('lançar no livro da conta', error);
    },

    async transfer(input) {
      const { error } = await db.schema(BANK).rpc('transfer', {
        p_from_account: input.fromAccountId,
        p_to_account: input.toAccountId,
        p_amount_cents: input.amountCents,
        p_occurred_on: input.occurredOn,
        p_description: input.description,
      });
      if (error) fail('transferir entre contas', error);
    },
  };
}
