/**
 * Tipos do Módulo 25 — Calendário Editorial.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * O canal é dado do tenant; o fluxo é desenho do tenant (Lei das Etapas,
 * 4ª aplicação); a pauta carrega o PAR de datas — a planejada (plano, muda
 * livre) e a real (carimbo do servidor no ato de registrar a publicação).
 * Os dois fins são terminais: a pauta que revive é pauta nova.
 *
 * @see supabase/migrations/0040_edcal.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-EDCAL-SPEC.md — o fluxo de negócio
 */

export type PieceStatus = 'planned' | 'published' | 'dropped';

/** Um canal — DADO DO TENANT, nunca enum do produto. Volta do arquivo. */
export interface Channel {
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'archived';
}

/** Uma etapa do fluxo editorial — DESENHO DO TENANT (Lei das Etapas). */
export interface EditorialStage {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}

export interface Piece {
  readonly id: string;
  readonly title: string;
  /** O texto de trabalho — e ele NÃO passeia no envelope. */
  readonly brief: string;
  readonly channelId: string;
  /** A etapa atual — null quando o fim foi registrado (vive na trilha). */
  readonly currentStageId: string | null;
  /** O PLANO — muda livre até o fim, sem trilha (decisão de canon). */
  readonly plannedOn: string;
  readonly status: PieceStatus;
  /** O FATO — carimbo do servidor no ato de registrar a publicação. */
  readonly publishedAt: string | null;
  readonly dropReason: string;
}

export interface NewPieceInput {
  readonly title?: unknown;
  readonly brief?: unknown;
  readonly channelId?: unknown;
  readonly stageId?: unknown;
  readonly plannedOn?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
