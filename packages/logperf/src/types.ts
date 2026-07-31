/**
 * Tipos puros do Módulo 52 — Performance Logística.
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a avaliação PONTUAL
 * da performance de uma rota / transportadora / centro de distribuição.
 *
 * ⭐ O REUSO do `vperf` (Módulo 46): avaliação PONTUAL (sem `CycleStatus`, sem
 * `Cycle` — a física do `sec.patrols`), nota 0–100 OBRIGATÓRIA, parecer
 * obrigatório, ato imutável, avaliador (`appraiserId`) carimbado pelo servidor.
 *
 * ⭐ O DIVERGE do `vperf`: o AVALIADO. Lá é um FORNECEDOR (`supplierId`,
 * obrigatório); aqui é uma rota/transportadora/CD em TEXTO LIVRE (`subject`),
 * com um vínculo OPCIONAL a um centro por ID SOLTO (`dcCenterId`, nullable).
 *
 * @see supabase/migrations/0067_logperf.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-LOGPERF-SPEC.md — o fluxo de negócio
 */

/** Uma avaliação de performance logística. Campos do servidor nascem vazios. */
export interface Appraisal {
  readonly id: string;
  /** ⭐ O AVALIADO em TEXTO LIVRE — a rota/transportadora/CD. O DIVERGE do vperf. */
  readonly subject: string;
  /** Vínculo OPCIONAL a um centro por ID SOLTO — nullable, sem FK. */
  readonly dcCenterId: string | null;
  /** A régua do método: 0–100, OBRIGATÓRIA. */
  readonly rating: number;
  readonly summary: string;
  /** A data a que a avaliação se refere (o período medido). Pode ser nula. */
  readonly assessedOn: string | null;
  /** Carimbado pelo SERVIDOR (auth.uid()) — nunca do formulário. */
  readonly appraiserId: string | null;
  readonly appraisedAt: string;
}

/** A entrada crua de uma avaliação nova — os campos vêm do formulário. */
export interface NewAppraisalInput {
  readonly subject?: unknown;
  readonly dcCenterId?: unknown;
  readonly rating?: unknown;
  readonly summary?: unknown;
  readonly assessedOn?: unknown;
}

/** Um resumo contável das avaliações. Todo número é `.length`, nunca chute. */
export interface AppraisalSummary {
  readonly total: number;
  /** Média das notas; `null` quando não há nenhuma avaliação (nunca zero fabricado). */
  readonly averageRating: number | null;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
