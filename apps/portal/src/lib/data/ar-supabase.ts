import type { SupabaseClient } from '@supabase/supabase-js';

import type { Receivable, ReceivableStatus } from '@alsham/accounts-receivable';

import { DataPortError } from './port';
import type { ArPort, ReceivableRow } from './ar-port';

/**
 * Adapter REAL do Módulo 5 — fala com o Supabase **como o usuário**, sob RLS.
 *
 * ⛔ **A `service_role key` não aparece neste arquivo, e não pode aparecer.**
 *
 * ⛔ **Não existe `delete` neste arquivo**: `ar.receivables` não tem policy nem
 * GRANT de DELETE. Cancelar é `status`.
 *
 * ⚠️ Zero regra de negócio. Traduz linha de banco em tipo do domínio e volta.
 *
 * ⚠️ **O schema `ar` precisa estar EXPOSTO na Data API do Supabase** — lição
 * paga na Etapa 9 e repetida nas 10 e 11. Está no runbook (§10.0).
 *
 * O `tenantId` chega resolvido da sessão (`lib/session.ts`) — nunca da URL.
 */

const AR = 'ar';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface ReceivableDbRow {
  id: string;
  external_ref: string;
  due_date: string;
  amount_cents: number;
  received_amount_cents: number;
  currency: string;
  payer_name: string | null;
  counterparty_tax_id: string | null;
  description: string | null;
  settlement_method: string | null;
  status: ReceivableStatus;
  created_at: string;
}

function toReceivable(r: ReceivableDbRow): ReceivableRow {
  return {
    id: r.id,
    externalRef: r.external_ref,
    dueDate: r.due_date,
    amountCents: Number(r.amount_cents),
    receivedAmountCents: Number(r.received_amount_cents),
    currency: r.currency,
    payerName: r.payer_name,
    counterpartyTaxId: r.counterparty_tax_id,
    description: r.description ?? '',
    settlementMethod: r.settlement_method,
    status: r.status,
    createdAt: r.created_at,
  };
}

export function createArSupabasePort(db: SupabaseClient, tenantId: string): ArPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'ar.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r) => r.permission_key as string));
    },

    async loadReceivables() {
      const { data, error } = await db
        .schema(AR)
        .from('receivables')
        .select(
          'id, external_ref, due_date, amount_cents, received_amount_cents, currency, payer_name, counterparty_tax_id, description, settlement_method, status, created_at',
        )
        // Vencimento primeiro: quem abre esta tela quer saber o que vence antes.
        .order('due_date', { ascending: true })
        .limit(200);
      if (error) fail('carregar os títulos', error);
      return (data ?? []).map((r) => toReceivable(r as unknown as ReceivableDbRow));
    },

    async createReceivable(receivable: Receivable) {
      const { data, error } = await db
        .schema(AR)
        .from('receivables')
        .insert({
          tenant_id: tenantId,
          external_ref: receivable.externalRef,
          due_date: receivable.dueDate,
          amount_cents: receivable.amountCents,
          currency: receivable.currency,
          payer_name: receivable.payerName,
          counterparty_tax_id: receivable.counterpartyTaxId,
          description: receivable.description,
          settlement_method: receivable.settlementMethod,
          status: receivable.status,
        })
        .select('id')
        .single();

      if (error) {
        // 23505 é o `unique (tenant_id, external_ref)`. O operador precisa
        // saber que é documento repetido, não pane do sistema.
        if ((error as { code?: string }).code === '23505') {
          throw new DataPortError(
            `Já existe um título com a referência ${receivable.externalRef} neste tenant.`,
            { cause: error },
          );
        }
        fail('registrar o título', error);
      }
      return { receivableId: (data as { id: string }).id };
    },

    async applyReceipt(input) {
      const { error } = await db
        .schema(AR)
        .from('receivables')
        .update({
          received_amount_cents: input.receivedAmountCents,
          status: input.status,
          ...(input.settlementMethod !== null
            ? { settlement_method: input.settlementMethod }
            : {}),
        })
        .eq('id', input.receivableId)
        .eq('tenant_id', tenantId);

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === '42501') {
          throw new DataPortError(
            'Você não tem permissão para alterar este título.',
            { cause: error },
          );
        }
        if (code === '22023') {
          throw new DataPortError(
            'Esta mudança de estado não existe no ciclo de vida do título.',
            { cause: error },
          );
        }
        // ⭐ Aqui NÃO há constraint de "receber a maior": ela não existe de
        // propósito (`0010_ar.sql` §2.1). Um 23514 aqui seria a coerência de
        // estado, não o excedente.
        fail('registrar o recebimento', error);
      }
    },

    async updateStatus(input) {
      const { error } = await db
        .schema(AR)
        .from('receivables')
        .update({ status: input.status })
        .eq('id', input.receivableId)
        // Cinto: o `tenant_id` da sessão também no WHERE. A RLS já barraria,
        // mas errar em silêncio numa linha de outro tenant é o tipo de bug que
        // ninguém vê acontecer.
        .eq('tenant_id', tenantId);

      if (error) {
        const code = (error as { code?: string }).code;
        // `ar.guard_status_transition()` levanta 42501 sem `ar.receivable.cancel`
        // e 22023 quando a transição não existe. São coisas diferentes, e o
        // operador resolve cada uma de um jeito.
        if (code === '42501') {
          throw new DataPortError(
            'Você não tem a permissão ar.receivable.cancel para cancelar este título.',
            { cause: error },
          );
        }
        if (code === '22023') {
          throw new DataPortError(
            'Esta mudança de estado não existe no ciclo de vida do título.',
            { cause: error },
          );
        }
        fail('atualizar o título', error);
      }
    },
  };
}
