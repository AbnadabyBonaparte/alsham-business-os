import type { SupabaseClient } from '@supabase/supabase-js';

import type { NoticeAck, NoticeStatus } from '@alsham/comms';

import { DataPortError } from './port';
import type { CommPort, NoticeRow } from './comm-port';

const COMM = 'comm';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface NoticeDb {
  id: string;
  title: string;
  body: string;
  audience: string;
  status: NoticeStatus;
  published_at: string | null;
  corrects_notice_id: string | null;
  corrects_title: string;
  created_at: string;
}

interface AckDb {
  id: string;
  notice_id: string;
  user_id: string;
  acked_at: string;
}

export function createCommSupabasePort(db: SupabaseClient, tenantId: string, userId: string): CommPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'comm.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async currentUserId() {
      return userId;
    },

    async loadNotices() {
      const { data, error } = await db
        .schema(COMM)
        .from('notices')
        .select('id, title, body, audience, status, published_at, corrects_notice_id, corrects_title, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) fail('carregar o mural', error);
      return ((data ?? []) as NoticeDb[]).map(
        (n): NoticeRow => ({
          id: n.id,
          title: n.title,
          body: n.body ?? '',
          audience: n.audience,
          status: n.status,
          publishedAt: n.published_at,
          correctsNoticeId: n.corrects_notice_id,
          correctsTitle: n.corrects_title ?? '',
          createdAt: n.created_at,
        }),
      );
    },

    async loadAcks() {
      const { data, error } = await db
        .schema(COMM)
        .from('acks')
        .select('id, notice_id, user_id, acked_at')
        .eq('tenant_id', tenantId);
      if (error) fail('carregar as ciências', error);
      return ((data ?? []) as AckDb[]).map(
        (a): NoticeAck => ({
          id: a.id,
          noticeId: a.notice_id,
          userId: a.user_id,
          ackedAt: a.acked_at,
        }),
      );
    },

    async createNotice(input) {
      const { data, error } = await db
        .schema(COMM)
        .from('notices')
        .insert({
          tenant_id: tenantId,
          title: input.title,
          body: input.body,
          audience: input.audience,
          corrects_notice_id: input.correctsNoticeId,
        })
        .select('id')
        .single();
      if (error) fail('redigir o comunicado', error);
      return { noticeId: (data as { id: string }).id };
    },

    async updateDraft(input) {
      const { error } = await db
        .schema(COMM)
        .from('notices')
        .update({ title: input.title, body: input.body, audience: input.audience })
        .eq('id', input.noticeId)
        .eq('tenant_id', tenantId);
      if (error) fail('editar o rascunho', error);
    },

    async setStatus(input) {
      const { error } = await db
        .schema(COMM)
        .from('notices')
        .update({ status: input.status })
        .eq('id', input.noticeId)
        .eq('tenant_id', tenantId);
      if (error) fail('mover o comunicado', error);
    },

    async ackNotice(input) {
      // O user_id NÃO vai daqui: o gatilho força o próprio punho.
      const { error } = await db.schema(COMM).from('acks').insert({
        tenant_id: tenantId,
        notice_id: input.noticeId,
      });
      if (error) fail('dar ciência', error);
    },
  };
}
