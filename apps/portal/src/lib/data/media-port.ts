import type { AssetTagLink, MediaAsset, MediaTag, MediaUsage } from '@alsham/media';

export interface AssetRowMedia extends MediaAsset {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 26 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: upload (catálogo, não cofre), apagar ativo ou
 * uso (o fim é status; o livro é eterno), editar uso registrado. Só a
 * etiqueta se desfaz — metadado vivo do catálogo.
 */
export interface MediaPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadAssets(): Promise<AssetRowMedia[]>;
  loadTags(): Promise<MediaTag[]>;
  loadAssetTags(): Promise<AssetTagLink[]>;
  loadUsages(): Promise<MediaUsage[]>;
  createAsset(input: {
    title: string;
    description: string;
    assetType: string;
    location: string;
  }): Promise<{ assetId: string }>;
  updateAsset(input: {
    assetId: string;
    title: string;
    description: string;
    assetType: string;
    location: string;
  }): Promise<void>;
  setAssetStatus(input: { assetId: string; status: 'active' | 'archived' }): Promise<void>;
  createTag(input: { name: string }): Promise<{ tagId: string }>;
  tagAsset(input: { assetId: string; tagId: string }): Promise<void>;
  untagAsset(input: { assetId: string; tagId: string }): Promise<void>;
  recordUsage(input: { assetId: string; usedIn: string; note: string }): Promise<void>;
}
