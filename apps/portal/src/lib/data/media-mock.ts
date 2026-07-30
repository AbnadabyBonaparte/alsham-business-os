import type { AssetTagLink, MediaTag, MediaUsage } from '@alsham/media';

import type { MediaPort, AssetRowMedia } from './media-port';

const agora = () => new Date().toISOString();

let seq = 10;
let usageSeq = 2;

const assets: AssetRowMedia[] = [
  {
    id: 'mock-ma-1',
    title: 'Logo dourado — versão vetorial',
    description: 'arquivo-mestre da marca',
    assetType: 'vetor',
    location: 'drive da agência / pasta marca',
    status: 'active',
    createdAt: agora(),
  },
  {
    id: 'mock-ma-2',
    title: 'Fotos da fachada (ensaio 2025)',
    description: '',
    assetType: 'foto',
    location: 'HD externo da sala 2',
    status: 'archived',
    createdAt: agora(),
  },
];

const tags: MediaTag[] = [{ id: 'mock-mt-1', name: 'marca' }];

const links: AssetTagLink[] = [{ assetId: 'mock-ma-1', tagId: 'mock-mt-1' }];

const usages: MediaUsage[] = [
  {
    id: 'mock-mu-1',
    seq: 1,
    assetId: 'mock-ma-1',
    usedIn: 'campanha de inauguração',
    note: '',
    referenceId: null,
    usedAt: agora(),
  },
];

export function createMediaMockPort(): MediaPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['media.asset.manage', 'media.usage.record']);
    },

    async loadAssets() {
      return [...assets];
    },

    async loadTags() {
      return [...tags];
    },

    async loadAssetTags() {
      return [...links];
    },

    async loadUsages() {
      return [...usages];
    },

    async createAsset(input) {
      const id = `mock-ma-${(seq += 1)}`;
      assets.push({
        id,
        title: input.title,
        description: input.description,
        assetType: input.assetType,
        location: input.location,
        status: 'active',
        createdAt: agora(),
      });
      return { assetId: id };
    },

    async updateAsset(input) {
      const i = assets.findIndex((a) => a.id === input.assetId);
      if (i < 0) throw new Error('obra não encontrada');
      assets[i] = {
        ...assets[i]!,
        title: input.title,
        description: input.description,
        assetType: input.assetType,
        location: input.location,
      };
    },

    async setAssetStatus(input) {
      const i = assets.findIndex((a) => a.id === input.assetId);
      if (i < 0) throw new Error('obra não encontrada');
      assets[i] = { ...assets[i]!, status: input.status };
    },

    async createTag(input) {
      const id = `mock-mt-${(seq += 1)}`;
      tags.push({ id, name: input.name });
      return { tagId: id };
    },

    async tagAsset(input) {
      if (!links.some((l) => l.assetId === input.assetId && l.tagId === input.tagId)) {
        links.push({ assetId: input.assetId, tagId: input.tagId });
      }
    },

    async untagAsset(input) {
      const i = links.findIndex((l) => l.assetId === input.assetId && l.tagId === input.tagId);
      if (i >= 0) links.splice(i, 1);
    },

    async recordUsage(input) {
      const a = assets.find((x) => x.id === input.assetId);
      if (!a) throw new Error('obra não encontrada');
      // O mock imita o gatilho: fora do acervo não se usa.
      if (a.status === 'archived') throw new Error('ativo arquivado não recebe uso novo');
      usages.push({
        id: `mock-mu-${(usageSeq += 1)}`,
        seq: usageSeq,
        assetId: input.assetId,
        usedIn: input.usedIn,
        note: input.note,
        referenceId: null,
        usedAt: agora(),
      });
    },
  };
}
