/**
 * Tipos do Módulo 24 — Comunicados.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * Publicar congela a palavra dada; corrigir é comunicado novo referenciando
 * o antigo; a ciência é ato próprio, único e eterno — e só o que está no
 * mural recebe ciência.
 *
 * @see supabase/migrations/0039_comm.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-COMM-SPEC.md — o fluxo de negócio
 */

export type NoticeStatus = 'draft' | 'published' | 'archived';

export interface Notice {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  /** Para quem se fala — texto livre; a entrega é de gente. */
  readonly audience: string;
  readonly status: NoticeStatus;
  /** O ato de publicar — do servidor. */
  readonly publishedAt: string | null;
  /** ⭐ Corrigir é comunicado novo — id solto + título carimbado. */
  readonly correctsNoticeId: string | null;
  readonly correctsTitle: string;
}

/** Uma ciência — ato próprio, único e eterno. */
export interface NoticeAck {
  readonly id: string;
  readonly noticeId: string;
  readonly userId: string;
  readonly ackedAt: string;
}

export interface NewNoticeInput {
  readonly title?: unknown;
  readonly body?: unknown;
  readonly audience?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
