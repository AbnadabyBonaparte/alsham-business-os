import type { SupabaseClient } from '@supabase/supabase-js';

import type { RulerStatus, StepExecution, TitleStatus } from '@alsham/dunning';

import { DataPortError } from './port';
import type { DunPort, DunTitleRow, RulerWithSteps } from './dun-port';

const DUN = 'dun';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface RulerDb {
  id: string;
  tenant_id: string;
  name: string;
  status: RulerStatus;
}

interface StepDb {
  id: string;
  ruler_id: string;
  position: number;
  name: string;
  days_after_due: number;
  channel: string | null;
}

interface TitleDb {
  id: string;
  tenant_id: string;
  source_module_id: string;
  external_ref: string;
  due_date: string;
  amount_cents: number;
  received_amount_cents: number;
  currency: string;
  payer_name: string | null;
  counterparty_tax_id: string | null;
  description: string;
  status: TitleStatus;
  entered_at: string | null;
  left_at: string | null;
  created_at: string;
}

interface ExecutionDb {
  id: string;
  title_id: string;
  step_id: string | null;
  step_name: string;
  channel: string | null;
  days_after_due: number | null;
  note: string;
  executed_at: string;
}

export function createDunSupabasePort(db: SupabaseClient, tenantId: string): DunPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'dun.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadRulers() {
      const { data: rulers, error } = await db
        .schema(DUN)
        .from('rulers')
        .select('id, tenant_id, name, status')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) fail('carregar as réguas', error);

      const rows = (rulers ?? []) as RulerDb[];
      if (rows.length === 0) return [];

      const { data: steps, error: stepsErr } = await db
        .schema(DUN)
        .from('steps')
        .select('id, ruler_id, position, name, days_after_due, channel')
        .eq('tenant_id', tenantId);
      if (stepsErr) fail('carregar os passos', stepsErr);

      const bySteps = new Map<string, StepDb[]>();
      for (const raw of steps ?? []) {
        const s = raw as StepDb;
        const list = bySteps.get(s.ruler_id) ?? [];
        list.push(s);
        bySteps.set(s.ruler_id, list);
      }

      return rows.map(
        (r): RulerWithSteps => ({
          ruler: { id: r.id, tenantId: r.tenant_id, name: r.name, status: r.status },
          steps: (bySteps.get(r.id) ?? [])
            .sort((a, b) => a.position - b.position)
            .map((s) => ({
              id: s.id,
              rulerId: s.ruler_id,
              position: s.position,
              name: s.name,
              daysAfterDue: Number(s.days_after_due),
              channel: s.channel,
            })),
        }),
      );
    },

    async loadTitles() {
      const { data, error } = await db
        .schema(DUN)
        .from('titles')
        .select(
          'id, tenant_id, source_module_id, external_ref, due_date, amount_cents, received_amount_cents, currency, payer_name, counterparty_tax_id, description, status, entered_at, left_at, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('due_date', { ascending: true });
      if (error) fail('carregar os títulos da régua', error);
      return ((data ?? []) as TitleDb[]).map(
        (t): DunTitleRow => ({
          id: t.id,
          tenantId: t.tenant_id,
          sourceModuleId: t.source_module_id,
          externalRef: t.external_ref,
          dueDate: t.due_date,
          amountCents: Number(t.amount_cents),
          receivedAmountCents: Number(t.received_amount_cents),
          currency: t.currency,
          payerName: t.payer_name,
          counterpartyTaxId: t.counterparty_tax_id,
          description: t.description ?? '',
          status: t.status,
          enteredAt: t.entered_at,
          leftAt: t.left_at,
          createdAt: t.created_at,
        }),
      );
    },

    async loadExecutions() {
      const { data, error } = await db
        .schema(DUN)
        .from('step_executions')
        .select('id, title_id, step_id, step_name, channel, days_after_due, note, executed_at')
        .eq('tenant_id', tenantId);
      if (error) fail('carregar as execuções', error);
      return ((data ?? []) as ExecutionDb[]).map(
        (e): StepExecution => ({
          id: e.id,
          titleId: e.title_id,
          stepId: e.step_id,
          stepName: e.step_name,
          channel: e.channel,
          daysAfterDue: e.days_after_due === null ? null : Number(e.days_after_due),
          note: e.note ?? '',
          executedAt: e.executed_at,
        }),
      );
    },

    async createRuler(input) {
      const { data, error } = await db
        .schema(DUN)
        .from('rulers')
        .insert({ tenant_id: tenantId, name: input.name })
        .select('id')
        .single();
      if (error) fail('criar a régua (só pode haver UMA ativa)', error);
      const rulerId = (data as { id: string }).id;

      const { error: stepsErr } = await db.schema(DUN).from('steps').insert(
        input.steps.map((s) => ({
          tenant_id: tenantId,
          ruler_id: rulerId,
          position: s.position,
          name: s.name,
          days_after_due: s.daysAfterDue,
          channel: s.channel,
        })),
      );
      if (stepsErr) fail('criar os passos da régua', stepsErr);

      return { rulerId };
    },

    async archiveRuler(input) {
      const { error } = await db
        .schema(DUN)
        .from('rulers')
        .update({ status: 'archived' })
        .eq('id', input.rulerId)
        .eq('tenant_id', tenantId);
      if (error) fail('arquivar a régua', error);
    },

    async executeStep(input) {
      const { error } = await db.schema(DUN).rpc('execute_step', {
        p_title_id: input.titleId,
        p_step_id: input.stepId,
        p_note: input.note,
      });
      if (error) fail('executar o passo', error);
    },
  };
}
