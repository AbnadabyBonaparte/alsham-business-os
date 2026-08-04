import type { SupabaseClient } from '@supabase/supabase-js';

import { DataPortError } from './port';
import type {
  LeasePort,
  LeaseAgreementRow,
  LeaseSalesReportRow,
} from './lease-port';

const LEASE = 'lease';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface AgreementDb {
  id: string;
  store_name: string | null;
  contract_ref: string | null;
  revenue_share: string | null;
  status: 'active' | 'ended';
  end_reason: string | null;
}

interface SalesReportDb {
  id: string;
  agreement_id: string;
  competency: string;
  reported_amount_cents: number | string;
  currency: string | null;
  note: string | null;
}

export function createLeaseSupabasePort(db: SupabaseClient, tenantId: string): LeasePort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'lease.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadAgreements() {
      const { data, error } = await db
        .schema(LEASE)
        .from('agreements')
        .select('id, store_name, contract_ref, revenue_share, status, end_reason')
        .eq('tenant_id', tenantId)
        .order('store_name', { ascending: true });
      if (error) fail('carregar os contratos de locação', error);
      return ((data ?? []) as AgreementDb[]).map(
        (a): LeaseAgreementRow => ({
          id: a.id,
          storeName: a.store_name ?? '',
          contractRef: a.contract_ref ?? '',
          revenueShare: a.revenue_share ?? '',
          status: a.status,
          endReason: a.end_reason ?? '',
        }),
      );
    },

    async loadSalesReports() {
      const { data, error } = await db
        .schema(LEASE)
        .from('sales_reports')
        .select('id, agreement_id, competency, reported_amount_cents, currency, note')
        .eq('tenant_id', tenantId)
        .order('competency', { ascending: false });
      if (error) fail('carregar as vendas declaradas', error);
      return ((data ?? []) as SalesReportDb[]).map(
        (s): LeaseSalesReportRow => ({
          id: s.id,
          agreementId: s.agreement_id,
          competency: s.competency,
          amountCents: Number(s.reported_amount_cents),
          currency: (s.currency ?? 'BRL').trim(),
          note: s.note ?? '',
        }),
      );
    },
  };
}
