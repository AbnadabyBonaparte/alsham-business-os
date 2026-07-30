import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  Answer,
  ChkRunItem,
  ChkTemplate,
  ChkTemplateItem,
  RunStatus,
  TemplateStatus,
} from '@alsham/checklists';

import { DataPortError } from './port';
import type { ChkPort, ChkRunRow } from './chk-port';

const CHK = 'chk';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface TemplateDb {
  id: string;
  name: string;
  status: TemplateStatus;
}

interface TemplateItemDb {
  id: string;
  template_id: string;
  position: number;
  item_text: string;
  status: TemplateStatus;
}

interface RunDb {
  id: string;
  template_id: string;
  template_name: string;
  subject: string;
  status: RunStatus;
  started_at: string;
  completed_at: string | null;
  abandon_reason: string;
  created_at: string;
}

interface RunItemDb {
  id: string;
  run_id: string;
  position: number;
  item_text: string;
  answer: Answer | null;
  note: string;
  answered_at: string | null;
}

export function createChkSupabasePort(db: SupabaseClient, tenantId: string): ChkPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'chk.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadTemplates() {
      const { data, error } = await db
        .schema(CHK)
        .from('templates')
        .select('id, name, status')
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) fail('carregar os modelos', error);
      return ((data ?? []) as TemplateDb[]).map(
        (t): ChkTemplate => ({ id: t.id, name: t.name, status: t.status }),
      );
    },

    async loadTemplateItems() {
      const { data, error } = await db
        .schema(CHK)
        .from('template_items')
        .select('id, template_id, position, item_text, status')
        .eq('tenant_id', tenantId)
        .order('position');
      if (error) fail('carregar os itens dos modelos', error);
      return ((data ?? []) as TemplateItemDb[]).map(
        (i): ChkTemplateItem => ({
          id: i.id,
          templateId: i.template_id,
          position: Number(i.position),
          itemText: i.item_text,
          status: i.status,
        }),
      );
    },

    async loadRuns() {
      const { data, error } = await db
        .schema(CHK)
        .from('runs')
        .select('id, template_id, template_name, subject, status, started_at, completed_at, abandon_reason, created_at')
        .eq('tenant_id', tenantId)
        .order('started_at', { ascending: false });
      if (error) fail('carregar as execuções', error);
      return ((data ?? []) as RunDb[]).map(
        (r): ChkRunRow => ({
          id: r.id,
          templateId: r.template_id,
          templateName: r.template_name,
          subject: r.subject ?? '',
          status: r.status,
          startedAt: r.started_at,
          completedAt: r.completed_at,
          abandonReason: r.abandon_reason ?? '',
          createdAt: r.created_at,
        }),
      );
    },

    async loadRunItems() {
      const { data, error } = await db
        .schema(CHK)
        .from('run_items')
        .select('id, run_id, position, item_text, answer, note, answered_at')
        .eq('tenant_id', tenantId)
        .order('position');
      if (error) fail('carregar as pranchetas', error);
      return ((data ?? []) as RunItemDb[]).map(
        (i): ChkRunItem => ({
          id: i.id,
          runId: i.run_id,
          position: Number(i.position),
          itemText: i.item_text,
          answer: i.answer,
          note: i.note ?? '',
          answeredAt: i.answered_at,
        }),
      );
    },

    async createTemplate(input) {
      const { data, error } = await db
        .schema(CHK)
        .from('templates')
        .insert({ tenant_id: tenantId, name: input.name })
        .select('id')
        .single();
      if (error) fail('criar o modelo', error);
      const templateId = (data as { id: string }).id;
      const { error: e2 } = await db
        .schema(CHK)
        .from('template_items')
        .insert(
          input.items.map((item_text, position) => ({
            tenant_id: tenantId,
            template_id: templateId,
            position,
            item_text,
          })),
        );
      if (e2) fail('criar os itens do modelo', e2);
    },

    async startRun(input) {
      // A prancheta NÃO vai daqui: é o gatilho da abertura quem copia.
      const { data, error } = await db
        .schema(CHK)
        .from('runs')
        .insert({ tenant_id: tenantId, template_id: input.templateId, subject: input.subject })
        .select('id')
        .single();
      if (error) fail('abrir a execução', error);
      return { runId: (data as { id: string }).id };
    },

    async answerItem(input) {
      const { error } = await db
        .schema(CHK)
        .from('run_items')
        .update({ answer: input.answer, note: input.note })
        .eq('id', input.itemId)
        .eq('tenant_id', tenantId);
      if (error) fail('responder o item', error);
    },

    async setRunStatus(input) {
      const patch: Record<string, unknown> = { status: input.status };
      if (input.abandonReason !== undefined) patch.abandon_reason = input.abandonReason;
      const { error } = await db
        .schema(CHK)
        .from('runs')
        .update(patch)
        .eq('id', input.runId)
        .eq('tenant_id', tenantId);
      if (error) fail('encerrar a execução', error);
    },
  };
}
