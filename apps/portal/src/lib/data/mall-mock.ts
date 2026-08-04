import type { MallPort, MallStoreRow } from './mall-port';

// Dados fabricados e anônimos — modo de demonstração, sem nome de cliente.
const stores: MallStoreRow[] = [
  { id: 'mock-mall-1', storeName: 'Moda Aurora — Loja 12', segment: 'Moda', spaceName: 'Piso L1 · Unidade 12', status: 'active' },
  { id: 'mock-mall-2', storeName: 'Café do Átrio — Quiosque 3', segment: 'Alimentação', spaceName: 'Praça Central · Quiosque 3', status: 'active' },
  { id: 'mock-mall-3', storeName: 'TecnoPonto — Loja 27', segment: 'Eletrônicos', spaceName: 'Piso L2 · Unidade 27', status: 'active' },
  { id: 'mock-mall-4', storeName: 'Livraria das Colunas — Loja 8', segment: 'Livraria', spaceName: 'Piso L1 · Unidade 8', status: 'active' },
  { id: 'mock-mall-5', storeName: 'Bem-Estar Farma — Loja 15', segment: 'Farmácia', spaceName: 'Piso L1 · Unidade 15', status: 'active' },
  { id: 'mock-mall-6', storeName: 'Ateliê Prisma — Loja 4', segment: 'Serviços', spaceName: 'Piso L2 · Unidade 4', status: 'archived' },
];

export function createMallMockPort(): MallPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set<string>();
    },

    async loadStores() {
      return [...stores];
    },
  };
}
