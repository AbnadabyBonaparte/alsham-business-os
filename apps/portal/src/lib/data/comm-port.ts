import type { Notice, NoticeAck } from '@alsham/comms';

export interface NoticeRow extends Notice {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 24 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: editar publicado (a palavra dada congela), dar
 * ciência por outro (o gatilho força o próprio punho), retirar ciência e
 * apagar comunicado. A porta não promete o que o schema nega.
 */
export interface CommPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  currentUserId(): Promise<string>;
  loadNotices(): Promise<NoticeRow[]>;
  loadAcks(): Promise<NoticeAck[]>;
  createNotice(input: {
    title: string;
    body: string;
    audience: string;
    correctsNoticeId: string | null;
  }): Promise<{ noticeId: string }>;
  updateDraft(input: { noticeId: string; title: string; body: string; audience: string }): Promise<void>;
  setStatus(input: { noticeId: string; status: 'published' | 'archived' }): Promise<void>;
  ackNotice(input: { noticeId: string }): Promise<void>;
}
