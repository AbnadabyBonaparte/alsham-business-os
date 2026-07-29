import type { BrandContext } from '@alsham/ai';

import type { BrandPort } from './brand-port';

/**
 * Adapter MOCKADO do Cérebro da Marca.
 *
 * ⚠️ **Lei anti-viés nos dados de exemplo:** nenhum nome de cliente, nenhuma
 * marca real. O tom é genérico de propósito — o produto não sugere como a
 * empresa deve falar.
 */
export function createBrandMockPort(): BrandPort {
  let atual: BrandContext = {
    identity: '',
    tone: '',
    forbidden: [],
  };
  return {
    kind: 'mock',
    async load() {
      return { ...atual, forbidden: [...atual.forbidden] };
    },
    async canEdit() {
      return true;
    },
    async save(input: BrandContext) {
      atual = { ...input, forbidden: [...input.forbidden] };
    },
  };
}
