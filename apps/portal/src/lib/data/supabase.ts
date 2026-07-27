import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type {
  ApprovalItem,
  MatchingSettings,
  Payable,
  StatementLine,
} from '@alsham/finance-reconciliation';

import { DataPortError, type DataPort } from './port';

/**
 * Adapter REAL — fala com o Supabase como o USUÁRIO, sob RLS.
 *
 * ⚠️ **A `service_role key` não aparece neste arquivo, e não pode aparecer.**
 * Ela ignora toda a RLS: quem a usa vê todos os tenants. O painel usa a chave
 * publicável e a sessão do usuário, e é isso que faz o isolamento ser real em
 * vez de confiança na tela.
 *
 * ⚠️ Este arquivo **não** contém regra de negócio. Ele traduz linha de banco
 * em tipo do domínio e volta. Zero cálculo, zero decisão.
 *
 * **Estado honesto:** este adapter está escrito, mas **NÃO FOI EXERCITADO
 * CONTRA UM PROJETO SUPABASE** — nenhum projeto existe ainda (aplicar é ato
 * do dono, ver `docs/runbook/APLICAR.md`). O que foi provado é o schema que
 * ele consulta, no CI, contra um PostgreSQL 17 real.
 */

/** O schema `recon` não é exposto por padrão — o acesso é explícito. */
const RECON = 'recon';
const CORE = 'core';

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new DataPortError(
      'Supabase não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY, ou rode sem elas para usar o modo de demonstração.',
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** Traduz o erro do banco em mensagem apresentável. Nunca vaza stack na tela. */
function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

export function createSupabasePort(tenantId: string): DataPort {
  const db = client();

  return {
    kind: 'supabase',

    async listPermissions() {
      // Lê as permissões efetivas do usuário no tenant. A RLS de
      // `core.role_permissions` já limita o que ele enxerga.
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'recon.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r) => r.permission_key as string));
    },

    async loadMatchingSettings(): Promise<MatchingSettings> {
      const { data, error } = await db
        .schema(CORE)
        .from('tenant_modules')
        .select('settings')
        .eq('tenant_id', tenantId)
        .eq('module_id', 'recon')
        .maybeSingle();
      if (error) fail('carregar a configuração de conciliação', error);

      const raw = (data?.settings ?? {}) as Record<string, unknown>;
      const matching = (raw.matching ?? {}) as Record<string, unknown>;

      // ⚠️ Sem valores padrão inventados aqui. Configuração ausente é um fato
      // a reportar, não um número a chutar — chutar um limiar seria decidir
      // política do tenant dentro do app, exatamente o que a Lei anti-viés
      // proíbe.
      const { amountToleranceCents, dateToleranceDays, minScore } = matching;
      if (
        typeof amountToleranceCents !== 'number' ||
        typeof dateToleranceDays !== 'number' ||
        typeof minScore !== 'number'
      ) {
        throw new DataPortError(
          'A política de conciliação deste tenant não está configurada (settings.matching). Configure antes de conciliar.',
        );
      }
      return { amountToleranceCents, dateToleranceDays, minScore };
    },

    async loadStatementLines(): Promise<StatementLine[]> {
      const { data, error } = await db
        .schema(RECON)
        .from('statement_lines')
        .select(
          'id, tenant_id, statement_id, line_no, posted_at, value_date, amount_cents, currency, description, counterparty_name, counterparty_tax_id, external_id, balance_after_cents, status',
        )
        .in('status', ['unmatched', 'suggested'])
        .order('posted_at', { ascending: true });
      if (error) fail('carregar as linhas do extrato', error);

      return (data ?? []).map((r) => ({
        id: r.id as string,
        tenantId: r.tenant_id as string,
        statementId: r.statement_id as string,
        lineNo: r.line_no as number,
        postedAt: r.posted_at as string,
        valueDate: r.value_date as string | null,
        amountCents: Number(r.amount_cents),
        currency: r.currency as string,
        description: (r.description ?? '') as string,
        counterpartyName: r.counterparty_name as string | null,
        counterpartyTaxId: r.counterparty_tax_id as string | null,
        externalId: r.external_id as string | null,
        balanceAfterCents:
          r.balance_after_cents === null ? null : Number(r.balance_after_cents),
        status: r.status as StatementLine['status'],
      }));
    },

    async loadPayables(): Promise<Payable[]> {
      const { data, error } = await db
        .schema(RECON)
        .from('payables')
        .select(
          'id, tenant_id, source, source_module_id, external_ref, due_date, amount_cents, settled_amount_cents, currency, supplier_name, supplier_tax_id, description, status',
        )
        .in('status', ['open', 'partially_settled'])
        .order('due_date', { ascending: true });
      if (error) fail('carregar os títulos a pagar', error);

      return (data ?? []).map((r) => ({
        id: r.id as string,
        tenantId: r.tenant_id as string,
        source: r.source as Payable['source'],
        sourceModuleId: r.source_module_id as string | null,
        externalRef: r.external_ref as string,
        dueDate: r.due_date as string,
        amountCents: Number(r.amount_cents),
        settledAmountCents: Number(r.settled_amount_cents),
        currency: r.currency as string,
        supplierName: r.supplier_name as string | null,
        supplierTaxId: r.supplier_tax_id as string | null,
        description: (r.description ?? '') as string,
        status: r.status as Payable['status'],
      }));
    },

    async loadApprovalQueue(): Promise<ApprovalItem[]> {
      const { data, error } = await db
        .schema(RECON)
        .from('approval_queue')
        .select(
          'id, tenant_id, subject_type, subject_id, title, amount_cents, currency, status, requested_at, requested_by, decided_at, decided_by, decision_note',
        )
        .eq('status', 'pending')
        .order('requested_at', { ascending: true });
      if (error) fail('carregar a fila de aprovação', error);

      return (data ?? []).map((r) => ({
        id: r.id as string,
        tenantId: r.tenant_id as string,
        subjectType: r.subject_type as ApprovalItem['subjectType'],
        subjectId: r.subject_id as string,
        title: r.title as string,
        amountCents: r.amount_cents === null ? null : Number(r.amount_cents),
        currency: r.currency as string | null,
        status: r.status as ApprovalItem['status'],
        requestedAt: r.requested_at as string,
        requestedBy: r.requested_by as string | null,
        decidedAt: r.decided_at as string | null,
        decidedBy: r.decided_by as string | null,
        decisionNote: r.decision_note as string | null,
      }));
    },

    async decideMatch({ matchId, decision }) {
      const { data, error } = await db
        .schema(RECON)
        .from('reconciliation_matches')
        .update({ status: decision, decided_at: new Date().toISOString() })
        .eq('id', matchId)
        .select('id');
      if (error) fail('registrar sua decisão sobre o casamento', error);
      // Zero linhas = a policy barrou. Não é sucesso silencioso.
      if (!data || data.length === 0) {
        throw new DataPortError(
          'A decisão não foi gravada: você não tem permissão para gerir casamentos neste tenant.',
        );
      }
    },

    async decideApproval({ approvalId, decision, note }) {
      const { data, error } = await db
        .schema(RECON)
        .from('approval_queue')
        .update({
          status: decision,
          decided_at: new Date().toISOString(),
          decision_note: note ?? null,
        })
        .eq('id', approvalId)
        .select('id');
      if (error) fail('registrar sua decisão', error);
      if (!data || data.length === 0) {
        throw new DataPortError(
          'A decisão não foi gravada: você não tem a permissão recon.approval.decide neste tenant.',
        );
      }
    },
  };
}
