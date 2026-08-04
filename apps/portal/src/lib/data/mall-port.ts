/**
 * Porta de dados do Módulo 38 — própria (Lei do Lego §5.5.8).
 *
 * ⭐ **Somente leitura.** Repare no que NÃO existe: criar, editar ou arquivar
 * lojista. Esta é a tela-âncora do vertical Shopping Centers — ela mostra o que
 * o banco tem, sem prometer escrita que ainda não é frente de UI. A porta não
 * promete o que a tela não faz.
 */
export interface MallStoreRow {
  readonly id: string;
  readonly storeName: string;
  readonly segment: string;
  readonly spaceName: string;
  readonly status: 'active' | 'archived';
}

export interface MallPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadStores(): Promise<MallStoreRow[]>;
}
