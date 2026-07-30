import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Biblioteca de Mídia.**
 *
 * ⚠️ **Por que o `id` é `media`.** É a capacidade *Mídia* da Taxonomia,
 * greppável com fronteira (`media.`), sem colisão na frota — e sem
 * disfarce: o módulo é a biblioteca de mídia, não outra coisa.
 *
 * ⚠️ **Por que o Domain é `marketing`.** A Taxonomia §5 põe *Mídia* na
 * linha do 📢 Marketing. Terceira peça minerada da MESMA linha (evt,
 * edcal, media): cada capacidade é um módulo, como manda o Lego.
 *
 * ⭐ **HONESTIDADE ESTRUTURAL:** isto é CATÁLOGO, não cofre — o Storage
 * do Core não existe, e o módulo não finge guardá-lo: o ativo diz ONDE a
 * obra vive, em texto livre.
 *
 * @see docs/canon/MODULO-MEDIA-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0041_media.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'media',
  name: 'Biblioteca de Mídia',
  version: '0.1.0',
  summary:
    'O catálogo do acervo de mídia: cada ativo é um registro que diz onde a obra vive (texto livre — catálogo, não cofre), com tipo livre e etiquetas do tenant; o acervo volta do arquivo; e o uso é livro imutável, carimbado, com vínculo solto.',

  /** ⭐ Domain `marketing` — ver o argumento acima. */
  taxonomy: { layer: 'domain', domain: 'marketing' },

  capabilities: [{ key: 'media-library', canonicalName: 'Mídia' }],

  /**
   * Duas permissões — duas mãos: quem cuida do CATÁLOGO (catalogar,
   * etiquetar, arquivar, devolver) e quem escreve no LIVRO DE USO.
   */
  permissions: [
    {
      key: 'media.asset.manage',
      moduleId: 'media',
      description: 'Catalogar ativos, editar o registro, etiquetar, arquivar e devolver ao acervo.',
    },
    {
      key: 'media.usage.record',
      moduleId: 'media',
      description: 'Registrar um USO do ativo — ato imutável, carimbado pelo servidor, com vínculo solto opcional.',
    },
  ],

  events: {
    emits: [
      {
        type: 'media.asset.cataloged',
        version: 1,
        description: 'Uma obra entrou no acervo — título, tipo e o onde-vive no envelope.',
      },
      {
        type: 'media.asset.archived',
        version: 1,
        description: 'A obra saiu do acervo vivo — o catálogo e o livro de usos ficam.',
      },
      {
        type: 'media.asset.restored',
        version: 1,
        description: 'A obra voltou ao acervo — a MESMA obra, com a história inteira (o DIVERGE do pat).',
      },
      {
        type: 'media.usage.recorded',
        version: 1,
        description: 'Um uso foi registrado no livro — em quê, quando e por quem, com vínculo solto.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): registrar uso a partir de fato
     * de outro módulo (campanha, pauta) exigiria handler construído — e o
     * vínculo solto pela TELA já conta a história sem acoplamento.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'media.asset.manage',
  record: 'media.usage.record',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  cataloged: 'media.asset.cataloged',
  archived: 'media.asset.archived',
  restored: 'media.asset.restored',
  recorded: 'media.usage.recorded',
} as const;
