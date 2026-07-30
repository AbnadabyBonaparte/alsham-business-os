import type { SupabaseClient } from '@supabase/supabase-js';

import type { Channel, EditorialStage, PieceStatus } from '@alsham/editorial';

import { DataPortError } from './port';
import type { EdcalPort, PieceRow } from './edcal-port';

const EDCAL = 'edcal';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface PieceDb {
  id: string;
  title: string;
  brief: string;
  channel_id: string;
  current_stage_id: string | null;
  planned_on: string;
  status: PieceStatus;
  published_at: string | null;
  drop_reason: string;
  created_at: string;
}

export function createEdcalSupabasePort(db: SupabaseClient, tenantId: string): EdcalPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'edcal.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadChannels() {
      const { data, error } = await db
        .schema(EDCAL)
        .from('channels')
        .select('id, name, status')
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) fail('carregar os canais', error);
      return (data ?? []) as Channel[];
    },

    async loadStages() {
      const { data, error } = await db
        .schema(EDCAL)
        .from('stages')
        .select('id, name, position')
        .eq('tenant_id', tenantId)
        .order('position');
      if (error) fail('carregar o fluxo', error);
      return (data ?? []) as EditorialStage[];
    },

    async loadPieces() {
      const { data, error } = await db
        .schema(EDCAL)
        .from('pieces')
        .select('id, title, brief, channel_id, current_stage_id, planned_on, status, published_at, drop_reason, created_at')
        .eq('tenant_id', tenantId)
        .order('planned_on');
      if (error) fail('carregar o calendário', error);
      return ((data ?? []) as PieceDb[]).map(
        (p): PieceRow => ({
          id: p.id,
          title: p.title,
          brief: p.brief ?? '',
          channelId: p.channel_id,
          currentStageId: p.current_stage_id,
          plannedOn: p.planned_on,
          status: p.status,
          publishedAt: p.published_at,
          dropReason: p.drop_reason ?? '',
          createdAt: p.created_at,
        }),
      );
    },

    async createChannel(input) {
      const { data, error } = await db
        .schema(EDCAL)
        .from('channels')
        .insert({ tenant_id: tenantId, name: input.name })
        .select('id')
        .single();
      if (error) fail('criar o canal', error);
      return { channelId: (data as { id: string }).id };
    },

    async setChannelStatus(input) {
      const { error } = await db
        .schema(EDCAL)
        .from('channels')
        .update({ status: input.status })
        .eq('id', input.channelId)
        .eq('tenant_id', tenantId);
      if (error) fail('mover o canal', error);
    },

    async createStage(input) {
      const { data, error } = await db
        .schema(EDCAL)
        .from('stages')
        .insert({ tenant_id: tenantId, name: input.name, position: input.position })
        .select('id')
        .single();
      if (error) fail('criar a etapa', error);
      return { stageId: (data as { id: string }).id };
    },

    async removeStage(input) {
      const { error } = await db
        .schema(EDCAL)
        .from('stages')
        .delete()
        .eq('id', input.stageId)
        .eq('tenant_id', tenantId);
      if (error) fail('apagar a etapa (há pauta parada nela?)', error);
    },

    async createPiece(input) {
      const { data, error } = await db
        .schema(EDCAL)
        .from('pieces')
        .insert({
          tenant_id: tenantId,
          title: input.title,
          brief: input.brief,
          channel_id: input.channelId,
          current_stage_id: input.stageId,
          planned_on: input.plannedOn,
        })
        .select('id')
        .single();
      if (error) fail('planejar a pauta', error);
      return { pieceId: (data as { id: string }).id };
    },

    async updatePlan(input) {
      // ⭐ Reagendar é UPDATE honesto — o calendário é plano (canon §0).
      const { error } = await db
        .schema(EDCAL)
        .from('pieces')
        .update({ title: input.title, brief: input.brief, planned_on: input.plannedOn })
        .eq('id', input.pieceId)
        .eq('tenant_id', tenantId);
      if (error) fail('atualizar o plano', error);
    },

    async movePiece(input) {
      const { error } = await db.schema(EDCAL).rpc('move_piece', {
        p_piece_id: input.pieceId,
        p_to_stage_id: input.toStageId,
        p_note: input.note,
      });
      if (error) fail('mover a pauta', error);
    },

    async closePiece(input) {
      const { error } = await db.schema(EDCAL).rpc('close_piece', {
        p_piece_id: input.pieceId,
        p_outcome: input.outcome,
        p_reason: input.reason,
      });
      if (error) fail('registrar o fim da pauta', error);
    },
  };
}
