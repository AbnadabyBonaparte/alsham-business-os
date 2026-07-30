/**
 * Tipos do Módulo 18 — Patrimônio.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * A localização vigente NÃO é campo do bem — é consequência calculada do
 * livro de transferências (o termo vigente do ctr, re-perguntado para o
 * LUGAR). A baixa é terminal: o bem que volta é aquisição nova.
 *
 * @see supabase/migrations/0033_pat.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-PAT-SPEC.md — o fluxo de negócio
 */

export type AssetStatus = 'active' | 'written_off';

export type CategoryStatus = 'active' | 'archived';

export interface PatCategory {
  readonly id: string;
  readonly name: string;
  readonly status: CategoryStatus;
}

export interface Asset {
  readonly id: string;
  readonly name: string;
  /** ⭐ A etiqueta — única por tenant, inclusive dos baixados. */
  readonly code: string;
  readonly description: string;
  readonly categoryId: string | null;
  /** ⭐ A localização ORIGINAL, congelada no cadastro. A vigente é calculada. */
  readonly originalLocation: string;
  readonly acquisitionCostCents: number | null;
  readonly currency: string | null;
  readonly acquiredOn: string | null;
  readonly status: AssetStatus;
  /** O ato da baixa — do servidor. Terminal: nunca limpa. */
  readonly writtenOffAt: string | null;
  readonly writeOffReason: string;
}

/** Uma linha do livro do lugar — imutável, com o "de onde" do servidor. */
export interface AssetTransfer {
  readonly id: string;
  readonly assetId: string;
  readonly fromLocation: string;
  readonly toLocation: string;
  readonly note: string;
  readonly movedAt: string;
}

export interface NewAssetInput {
  readonly name?: unknown;
  readonly code?: unknown;
  readonly description?: unknown;
  readonly categoryId?: unknown;
  readonly originalLocation?: unknown;
  readonly acquisitionCostCents?: unknown;
  readonly currency?: unknown;
  readonly acquiredOn?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
