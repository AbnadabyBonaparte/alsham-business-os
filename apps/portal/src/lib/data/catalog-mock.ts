import type { CatalogPort, CatalogProductRow } from './catalog-port';

const products: CatalogProductRow[] = [
  { id: 'mock-cat-1', name: 'Arroz Tipo 1 5kg', sku: 'MERC-001', priceCents: 2890, currency: 'BRL', status: 'active' },
  { id: 'mock-cat-2', name: 'Feijão Carioca 1kg', sku: 'MERC-002', priceCents: 890, currency: 'BRL', status: 'active' },
  { id: 'mock-cat-3', name: 'Óleo de Soja 900ml', sku: 'MERC-003', priceCents: 720, currency: 'BRL', status: 'active' },
  { id: 'mock-cat-4', name: 'Banana Prata (kg)', sku: 'HORT-010', priceCents: 599, currency: 'BRL', status: 'active' },
  { id: 'mock-cat-5', name: 'Tomate Salada (kg)', sku: 'HORT-011', priceCents: 849, currency: 'BRL', status: 'active' },
  { id: 'mock-cat-6', name: 'Detergente Neutro 500ml', sku: 'LIMP-020', priceCents: 349, currency: 'BRL', status: 'active' },
  { id: 'mock-cat-7', name: 'Sabão em Pó 1kg', sku: 'LIMP-021', priceCents: 1590, currency: 'BRL', status: 'active' },
  { id: 'mock-cat-8', name: 'Café Torrado 500g', sku: null, priceCents: 1990, currency: 'BRL', status: 'archived' },
];

export function createCatalogMockPort(): CatalogPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['catalog.product.manage']);
    },

    async loadProducts() {
      return [...products];
    },
  };
}
