/**
 * Porta de dados do Módulo 72 — Catálogo de Produtos (`catalog`, Vertical
 * `retail`) — própria (Lei do Lego §5.5.8).
 *
 * ⚠️ **Read-only.** Esta tela é a ANCORA da rota `/catalogo`: ela lê o cadastro
 * e o mostra. Repare no que NÃO existe aqui: nenhum método de criar, editar
 * preço ou arquivar produto. A grade editável é uma frente de UI própria; a
 * porta não promete o que a tela ainda não faz.
 */
export interface CatalogProductRow {
  readonly id: string;
  readonly name: string;
  /** SKU em texto livre — opcional; nem toda casa usa código (a lição do crm). */
  readonly sku: string | null;
  readonly priceCents: number;
  readonly currency: string;
  /** `active` (à venda) ou `archived` (descontinuado — o produto que volta é o mesmo). */
  readonly status: string;
}

export interface CatalogPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadProducts(): Promise<CatalogProductRow[]>;
}
