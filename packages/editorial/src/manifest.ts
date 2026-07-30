import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Calendário Editorial.**
 *
 * ⚠️ **Por que o `id` é `edcal`.** "calendário" é prosa constante do canon
 * e `cal` é abreviação ambígua demais para grep com fronteira. `edcal` é
 * curto, greppável e diz o que é: o calendário EDITORIAL — conferido por
 * grep: zero colisões na frota.
 *
 * ⚠️ **Por que o Domain é `marketing`.** A Taxonomia §5 põe *Calendário*
 * na linha do 📢 Marketing (Campanhas · Eventos · Social media ·
 * Calendário · …) — este módulo é a leitura editorial dessa capacidade: a
 * pauta que vira peça, a peça que vai ao ar. O `evt` (Eventos) saiu da
 * MESMA linha; cada capacidade é um módulo, como manda o Lego.
 *
 * @see docs/canon/MODULO-EDCAL-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0040_edcal.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'edcal',
  name: 'Calendário Editorial',
  version: '0.1.0',
  summary:
    'O calendário da produção de conteúdo: canal como dado do tenant, fluxo editorial como desenho do tenant (Lei das Etapas), a pauta com o par de datas — planejada × real — e dois fins terminais: publicada (ato registrado, data do servidor) ou descartada (com razão).',

  /** ⭐ Domain `marketing` — ver o argumento acima. */
  taxonomy: { layer: 'domain', domain: 'marketing' },

  capabilities: [{ key: 'editorial-calendar', canonicalName: 'Calendário' }],

  /**
   * Três permissões — três mãos: quem DESENHA (canais e etapas), quem
   * PLANEJA e move a pauta, e quem REGISTRA o fim (publicou / morreu).
   */
  permissions: [
    {
      key: 'edcal.design.manage',
      moduleId: 'edcal',
      description: 'Desenhar o calendário do tenant: canais (criar, arquivar, devolver) e etapas do fluxo editorial.',
    },
    {
      key: 'edcal.piece.manage',
      moduleId: 'edcal',
      description: 'Planejar pautas, editar e reagendar o plano, e mover a pauta pelo fluxo (com trilha).',
    },
    {
      key: 'edcal.piece.decide',
      moduleId: 'edcal',
      description: 'Registrar o fim da pauta: publicada (a data real é do servidor) ou descartada (com razão). Terminal.',
    },
  ],

  events: {
    emits: [
      {
        type: 'edcal.piece.planned',
        version: 1,
        description: 'Uma pauta nasceu no calendário — canal, etapa e data planejada no envelope.',
      },
      {
        type: 'edcal.piece.moved',
        version: 1,
        description: 'A pauta mudou de etapa no fluxo do tenant — de/para pelo NOME carimbado.',
      },
      {
        type: 'edcal.piece.published',
        version: 1,
        description: 'O ATO de ter ido ao ar foi registrado — a data real ao lado da planejada. Terminal.',
      },
      {
        type: 'edcal.piece.dropped',
        version: 1,
        description: 'A pauta morreu, com a razão escrita. Terminal.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): auto-publicação é integração
     * declarada (Lei 3) — o módulo registra o ATO de publicar, nunca o
     * transporte até a rede.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  design: 'edcal.design.manage',
  manage: 'edcal.piece.manage',
  decide: 'edcal.piece.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  planned: 'edcal.piece.planned',
  moved: 'edcal.piece.moved',
  published: 'edcal.piece.published',
  dropped: 'edcal.piece.dropped',
} as const;
