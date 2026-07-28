import type { SupabaseClient } from '@supabase/supabase-js';

import type { Payable, PayableStatus } from '@alsham/accounts-payable';

import { DataPortError } from './port';
import type { ApPort, PayableRow } from './ap-port';

/**
 * Adapter REAL do Módulo 3 — fala com o Supabase **como o usuário**, sob RLS.
 *
 * ⛔ **A `service_role key` não aparece neste arquivo, e não pode aparecer.**
 * Consequência visível: não existe aqui nenhuma escrita em `recon.payables`. A
 * projeção do título no outro módulo é feita pelo correio, do servidor, e
 * `recon.record_external_payable()` não é concedida a `authenticated`. Se este
 * arquivo tentasse gravar lá, seria negado — e é assim que se quer: dar essa
 * caneta à tela deixaria o cliente inventar um título "vindo de outro módulo",
 * com origem forjada por dentro da RLS.
 *
 * ⛔ **Não existe `delete` neste arquivo**, e não é zelo: `ap.payables` não tem
 * policy nem GRANT de DELETE. Cancelar é `status`.
 *
 * ⚠️ Zero regra de negócio. Traduz linha de banco em tipo do domínio e volta.
 *
 * ⚠️ **O schema `ap` precisa estar EXPOSTO na Data API do Supabase** para este
 * arquivo funcionar — lição paga na Etapa 9 com o schema do `marketing`. Está
 * registrado no runbook (§8).
 *
 * O `tenantId` chega resolvido da sessão (`lib/session.ts`) — nunca da URL.
 */

const AP = 'ap';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface PayableDbRow {
  id: string;
  external_ref: string;
  due_date: string;
  amount_cents: number;
  settled_amount_cents: number;
  currency: string;
  supplier_name: string | null;
  counterparty_tax_id: string | null;
  description: string | null;
  payment_method: string | null;
  status: PayableStatus;
  created_at: string;
}

function toPayable(r: PayableDbRow): PayableRow {
  return {
    id: r.id,
    externalRef: r.external_ref,
    dueDate: r.due_date,
    amountCents: Number(r.amount_cents),
    settledAmountCents: Number(r.settled_amount_cents),
    currency: r.currency,
    supplierName: r.supplier_name,
    counterpartyTaxId: r.counterparty_tax_id,
    description: r.description ?? '',
    paymentMethod: r.payment_method,
    status: r.status,
    createdAt: r.created_at,
  };
}

export function createApSupabasePort(db: SupabaseClient, tenantId: string): ApPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'ap.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r) => r.permission_key as string));
    },

    async loadPayables() {
      const { data, error } = await db
        .schema(AP)
        .from('payables')
        .select(
          'id, external_ref, due_date, amount_cents, settled_amount_cents, currency, supplier_name, counterparty_tax_id, description, payment_method, status, created_at',
        )
        // Vencimento primeiro: quem abre esta tela quer saber o que vence antes.
        .order('due_date', { ascending: true })
        .limit(200);
      if (error) fail('carregar os títulos', error);
      return (data ?? []).map((r) => toPayable(r as unknown as PayableDbRow));
    },

    async createPayable(payable: Payable) {
      const { data, error } = await db
        .schema(AP)
        .from('payables')
        .insert({
          tenant_id: tenantId,
          external_ref: payable.externalRef,
          due_date: payable.dueDate,
          amount_cents: payable.amountCents,
          currency: payable.currency,
          supplier_name: payable.supplierName,
          counterparty_tax_id: payable.counterpartyTaxId,
          description: payable.description,
          payment_method: payable.paymentMethod,
          status: payable.status,
        })
        .select('id')
        .single();

      if (error) {
        // 23505 é o `unique (tenant_id, external_ref)`. O operador precisa
        // saber que é documento repetido, não pane do sistema.
        if ((error as { code?: string }).code === '23505') {
          throw new DataPortError(
            `Já existe um título com a referência ${payable.externalRef} neste tenant.`,
            { cause: error },
          );
        }
        fail('registrar o título', error);
      }
      return { payableId: (data as { id: string }).id };
    },

    async updateStatus(input) {
      const { error } = await db
        .schema(AP)
        .from('payables')
        .update({ status: input.status })
        .eq('id', input.payableId)
        // Cinto: o `tenant_id` da sessão também no WHERE. A RLS já barraria,
        // mas errar em silêncio numa linha de outro tenant é o tipo de bug que
        // ninguém vê acontecer.
        .eq('tenant_id', tenantId);

      if (error) {
        const code = (error as { code?: string }).code;
        // `ap.guard_status_transition()` levanta 42501 quando falta
        // `ap.payable.cancel`, e 22023 quando a transição não existe no ciclo
        // de vida. Mensagens próprias: são coisas diferentes, e o operador
        // resolve cada uma de um jeito.
        if (code === '42501') {
          throw new DataPortError(
            'Você não tem a permissão ap.payable.cancel para cancelar este título.',
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
