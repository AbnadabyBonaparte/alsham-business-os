import type { AssetTransfer, PatCategory } from '@alsham/assets';

import type { AssetRow, PatPort } from './pat-port';

const agora = () => new Date().toISOString();
const diasAtras = (d: number) => new Date(Date.now() - d * 86400000).toISOString();

let seq = 1;

const categories: PatCategory[] = [
  { id: 'mock-pc-1', name: 'máquina', status: 'active' },
  { id: 'mock-pc-2', name: 'veículo', status: 'active' },
];

const assets: AssetRow[] = [
  {
    id: 'mock-pat-1',
    name: 'Empilhadeira 03',
    code: 'ETQ-0031',
    description: 'Elétrica, 1,5t.',
    categoryId: 'mock-pc-1',
    originalLocation: 'galpão 1',
    acquisitionCostCents: 8500000,
    currency: 'BRL',
    acquiredOn: '2024-03-12',
    status: 'active',
    writtenOffAt: null,
    writeOffReason: '',
    createdAt: diasAtras(120),
  },
  {
    id: 'mock-pat-2',
    name: 'Van 12',
    code: 'ETQ-0104',
    description: '',
    categoryId: 'mock-pc-2',
    originalLocation: 'pátio',
    acquisitionCostCents: null,
    currency: null,
    acquiredOn: null,
    status: 'written_off',
    writtenOffAt: diasAtras(10),
    writeOffReason: 'vendida no leilão de julho',
    createdAt: diasAtras(400),
  },
];

const transfers: AssetTransfer[] = [
  {
    id: 'mock-pt-1',
    assetId: 'mock-pat-1',
    fromLocation: 'galpão 1',
    toLocation: 'obra da av. central',
    note: 'obra de 90 dias',
    movedAt: diasAtras(30),
  },
];

export function createPatMockPort(): PatPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['pat.asset.manage', 'pat.asset.decide', 'pat.setup.manage']);
    },

    async loadAssets() {
      return [...assets];
    },

    async loadTransfers() {
      return [...transfers];
    },

    async loadCategories() {
      return [...categories];
    },

    async createAsset(input) {
      const id = `mock-pat-${(seq += 1)}`;
      assets.unshift({
        id,
        name: input.name,
        code: input.code,
        description: input.description,
        categoryId: input.categoryId,
        originalLocation: input.originalLocation,
        acquisitionCostCents: input.acquisitionCostCents,
        currency: input.currency,
        acquiredOn: input.acquiredOn,
        status: 'active',
        writtenOffAt: null,
        writeOffReason: '',
        createdAt: agora(),
      });
      return { assetId: id };
    },

    async transferAsset(input) {
      const a = assets.find((x) => x.id === input.assetId);
      if (!a) throw new Error('bem não encontrado');
      // O mock imita o gatilho: o "de onde" é a vigente, nunca o formulário.
      const doBem = transfers
        .filter((t) => t.assetId === a.id)
        .sort((x, y) => (x.movedAt < y.movedAt ? 1 : -1));
      const vigente = doBem[0]?.toLocation ?? a.originalLocation;
      transfers.unshift({
        id: `mock-pt-${(seq += 1)}`,
        assetId: a.id,
        fromLocation: vigente,
        toLocation: input.toLocation,
        note: input.note,
        movedAt: agora(),
      });
    },

    async writeOffAsset(input) {
      const i = assets.findIndex((x) => x.id === input.assetId);
      if (i < 0) throw new Error('bem não encontrado');
      assets[i] = {
        ...assets[i]!,
        status: 'written_off',
        writtenOffAt: agora(),
        writeOffReason: input.reason,
      };
    },

    async createCategory(input) {
      categories.push({ id: `mock-pc-${(seq += 1)}`, name: input.name, status: 'active' });
    },
  };
}
