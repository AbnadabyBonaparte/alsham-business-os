/**
 * Tipos do Módulo 26 — Biblioteca de Mídia.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * CATÁLOGO, não cofre: o ativo é um registro que diz ONDE a obra vive
 * (texto livre — Storage do Core não construído, e a honestidade é
 * estrutural); o acervo volta do arquivo (o DIVERGE assinado do pat); o
 * uso é livro imutável com vínculo solto.
 *
 * @see supabase/migrations/0041_media.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-MEDIA-SPEC.md — o fluxo de negócio
 */

export type AssetStatus = 'active' | 'archived';

export interface MediaAsset {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  /** ⭐ Tipo TEXTO LIVRE — vazio é permitido e honesto (o precedente do cash). */
  readonly assetType: string;
  /** ⭐ ONDE VIVE — texto livre, obrigatório: URL, "HD da sala 2", o drive. */
  readonly location: string;
  readonly status: AssetStatus;
}

/** Uma etiqueta — DADO DO TENANT, nunca enum do produto. */
export interface MediaTag {
  readonly id: string;
  readonly name: string;
}

/** O vínculo N:N ativo × etiqueta — metadado vivo do catálogo. */
export interface AssetTagLink {
  readonly assetId: string;
  readonly tagId: string;
}

/** Um uso — ato próprio do livro: imutável, carimbado, com vínculo SOLTO. */
export interface MediaUsage {
  readonly id: string;
  readonly seq: number;
  readonly assetId: string;
  readonly usedIn: string;
  readonly note: string;
  readonly referenceId: string | null;
  readonly usedAt: string;
}

export interface NewAssetInput {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly assetType?: unknown;
  readonly location?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
