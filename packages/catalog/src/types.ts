/**
 * Tipos puros do Módulo 72 — Catálogo de Produtos.
 *
 * Nem banco, nem rede, nem relógio, nem UI: só o cadastro do que a loja vende.
 * Um produto tem nome, um SKU TEXTO LIVRE opcional e o preço de TABELA (valor em
 * centavos + moeda, juntos). O ciclo é `active` ↔ `archived` (o produto
 * descontinuado que volta é o MESMO produto — a física do vendor).
 *
 * @see supabase/migrations/0087_catalog.sql
 * @see docs/canon/MODULO-CATALOG-SPEC.md
 */

/** O ciclo do produto: `active` ↔ `archived` (a física do vendor — reversível). */
export type ProductStatus = 'active' | 'archived';

/** Um produto do catálogo. O `priceCents` é o preço de TABELA (lista). */
export interface Product {
  readonly id: string;
  /** Nome do produto. Obrigatório. */
  readonly name: string;
  /** ⭐ SKU em texto livre — OPCIONAL (nem toda casa usa código). `''` quando ausente. */
  readonly sku: string;
  /** Preço de tabela em centavos. `>= 0` (um brinde a 0 é honesto; negativo é infísico). */
  readonly priceCents: number;
  /** Moeda ISO-4217 (3 letras). */
  readonly currency: string;
  readonly status: ProductStatus;
}

/** A entrada crua de um produto novo — nasce sempre `active`. */
export interface NewProductInput {
  readonly name?: unknown;
  readonly sku?: unknown;
  readonly priceCents?: unknown;
  readonly currency?: unknown;
}

/** Um resumo contável do catálogo. */
export interface ProductSummary {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
