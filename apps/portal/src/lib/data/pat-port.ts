import type { Asset, AssetTransfer, PatCategory } from '@alsham/assets';

export interface AssetRow extends Asset {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 18 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: editar transferência (o livro é eterno, e o
 * "de onde" é do gatilho), apagar bem (a baixa é status terminal) e
 * escrever a localização vigente (ela é calculada). A porta não promete o
 * que o schema nega.
 */
export interface PatPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadAssets(): Promise<AssetRow[]>;
  loadTransfers(): Promise<AssetTransfer[]>;
  loadCategories(): Promise<PatCategory[]>;
  createAsset(input: {
    name: string;
    code: string;
    description: string;
    categoryId: string | null;
    originalLocation: string;
    acquisitionCostCents: number | null;
    currency: string | null;
    acquiredOn: string | null;
  }): Promise<{ assetId: string }>;
  transferAsset(input: { assetId: string; toLocation: string; note: string }): Promise<void>;
  writeOffAsset(input: { assetId: string; reason: string }): Promise<void>;
  createCategory(input: { name: string }): Promise<void>;
}
