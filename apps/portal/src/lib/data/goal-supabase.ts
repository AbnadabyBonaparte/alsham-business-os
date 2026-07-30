import type { SupabaseClient } from '@supabase/supabase-js';

import type { GoalCheckin, GoalStatus } from '@alsham/goals';

import { DataPortError } from './port';
import type { GoalPort, GoalRow } from './goal-port';

const GOAL = 'goal';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface GoalDb {
  id: string;
  title: string;
  description: string;
  metric: string;
  target_value: number | null;
  currency: string | null;
  starts_on: string;
  ends_on: string;
  assignee_user_id: string | null;
  status: GoalStatus;
  decided_at: string | null;
  cancel_reason: string;
  created_at: string;
}

interface CheckinDb {
  id: string;
  seq: number;
  goal_id: string;
  reported_value: number;
  note: string;
  reported_at: string;
}

export function createGoalSupabasePort(db: SupabaseClient, tenantId: string): GoalPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'goal.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadGoals() {
      const { data, error } = await db
        .schema(GOAL)
        .from('goals')
        .select(
          'id, title, description, metric, target_value, currency, starts_on, ends_on, assignee_user_id, status, decided_at, cancel_reason, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('ends_on');
      if (error) fail('carregar o placar de metas', error);
      return ((data ?? []) as GoalDb[]).map(
        (g): GoalRow => ({
          id: g.id,
          title: g.title,
          description: g.description ?? '',
          metric: g.metric,
          targetValue: g.target_value === null ? null : Number(g.target_value),
          currency: g.currency,
          startsOn: g.starts_on,
          endsOn: g.ends_on,
          assigneeUserId: g.assignee_user_id,
          status: g.status,
          decidedAt: g.decided_at,
          cancelReason: g.cancel_reason ?? '',
          createdAt: g.created_at,
        }),
      );
    },

    async loadCheckins() {
      const { data, error } = await db
        .schema(GOAL)
        .from('checkins')
        .select('id, seq, goal_id, reported_value, note, reported_at')
        .eq('tenant_id', tenantId)
        .order('seq', { ascending: false });
      if (error) fail('carregar o livro de check-ins', error);
      return ((data ?? []) as CheckinDb[]).map(
        (c): GoalCheckin => ({
          id: c.id,
          seq: Number(c.seq),
          goalId: c.goal_id,
          reportedValue: Number(c.reported_value),
          note: c.note ?? '',
          reportedAt: c.reported_at,
        }),
      );
    },

    async createGoal(input) {
      const { data, error } = await db
        .schema(GOAL)
        .from('goals')
        .insert({
          tenant_id: tenantId,
          title: input.title,
          description: input.description,
          metric: input.metric,
          target_value: input.targetValue,
          currency: input.currency,
          starts_on: input.startsOn,
          ends_on: input.endsOn,
        })
        .select('id')
        .single();
      if (error) fail('declarar a meta', error);
      return { goalId: (data as { id: string }).id };
    },

    async setStatus(input) {
      const patch: Record<string, unknown> = { status: input.status };
      if (input.cancelReason !== undefined) patch.cancel_reason = input.cancelReason;
      const { error } = await db
        .schema(GOAL)
        .from('goals')
        .update(patch)
        .eq('id', input.goalId)
        .eq('tenant_id', tenantId);
      if (error) fail('mover a meta', error);
    },

    async reportCheckin(input) {
      const { error } = await db.schema(GOAL).from('checkins').insert({
        tenant_id: tenantId,
        goal_id: input.goalId,
        reported_value: input.reportedValue,
        note: input.note,
      });
      if (error) fail('registrar o check-in', error);
    },
  };
}
