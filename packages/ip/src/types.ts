/**
 * Tipos puros do Módulo 69 — Propriedade Intelectual.
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o ativo de PI, o seu
 * tipo (uma das quatro categorias do direito) e o seu ciclo terminal.
 *
 * @see supabase/migrations/0084_ip.sql
 * @see docs/canon/MODULO-IP-SPEC.md
 */

/**
 * As quatro categorias clássicas de propriedade intelectual. É física do
 * direito, não vocabulário do tenant — por isso é lista fechada (CHECK no banco).
 */
export const ASSET_TYPES = ['patent', 'trademark', 'copyright', 'trade_secret'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/**
 * O ciclo TERMINAL: `filed` → `granted`/`rejected`, `granted` → `expired`.
 * `rejected` e `expired` não reabrem (o que volta é depósito novo).
 */
export type AssetStatus = 'filed' | 'granted' | 'rejected' | 'expired';

/** Um ativo de PI. Campos carimbados pelo servidor nascem vazios. */
export interface IpAsset {
  readonly id: string;
  readonly title: string;
  readonly assetType: AssetType;
  /** Número de registro — texto livre, opcional (vazio quando ausente). */
  readonly registrationNumber: string;
  /** Data de depósito — `YYYY-MM-DD`, opcional (`null` quando ausente). */
  readonly filedOn: string | null;
  readonly status: AssetStatus;
  /** A origem (idea/proj) por id solto — `null` quando não rastreável. */
  readonly sourceId: string | null;
  readonly sourceName: string;
  readonly note: string;
}

/** A entrada crua de um ativo novo — nasce sempre `filed`. */
export interface NewIpAssetInput {
  readonly title?: unknown;
  readonly assetType?: unknown;
  readonly registrationNumber?: unknown;
  readonly filedOn?: unknown;
  readonly sourceId?: unknown;
  readonly sourceName?: unknown;
  readonly note?: unknown;
}

/** Um resumo contável do acervo — por estado e por tipo. */
export interface IpSummary {
  readonly total: number;
  readonly filed: number;
  readonly granted: number;
  readonly rejected: number;
  readonly expired: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
