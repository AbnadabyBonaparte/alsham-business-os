import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Patrimônio.**
 *
 * ⚠️ **Por que o `id` é `pat`.** `assets` colide com o vocabulário de build
 * (a pasta `assets/` de qualquer app) e `patrimonio` inteiro não é
 * greppável no padrão dos eventos; `pat` é a abreviação consagrada do
 * ofício ("nº de pat.", "patrimoniar") — conferida por grep com fronteira
 * de palavra: zero colisões.
 *
 * @see docs/canon/MODULO-PAT-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0033_pat.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'pat',
  name: 'Patrimônio',
  version: '0.1.0',
  summary:
    'O livro de bens do tenant: etiqueta única, categoria desenhada pelo tenant, localização vigente calculada do livro de transferências — e a baixa terminal, com razão escrita e carimbo do servidor.',

  /**
   * ⭐ **Domain `operations` — Taxonomia §5, "🏭 Operações (10)"**,
   * capacidade *Patrimônio*. Manutenção é a capacidade vizinha — a ponte
   * (`mnt.orders.asset_id`) nasceu SOLTA na Quadra e continua solta.
   */
  taxonomy: { layer: 'domain', domain: 'operations' },

  capabilities: [{ key: 'assets', canonicalName: 'Patrimônio' }],

  /**
   * Três permissões: quem cadastra e move não é quem baixa — e o
   * vocabulário de categorias tem dona própria.
   */
  permissions: [
    {
      key: 'pat.asset.manage',
      moduleId: 'pat',
      description: 'Cadastrar e editar bens, e registrar transferências de localização.',
    },
    {
      key: 'pat.asset.decide',
      moduleId: 'pat',
      description: 'Baixar bens (alienação, perda, sucata) — ato terminal, com razão escrita.',
    },
    {
      key: 'pat.setup.manage',
      moduleId: 'pat',
      description: 'Desenhar as categorias de bens do tenant — nome livre, nunca enum.',
    },
  ],

  events: {
    emits: [
      {
        type: 'pat.asset.registered',
        version: 1,
        description: 'Um bem entrou no livro — com etiqueta, categoria e onde nasceu.',
      },
      {
        type: 'pat.asset.updated',
        version: 1,
        description: 'O bem mudou no que é FATO: nome, etiqueta, categoria, valor, data.',
      },
      {
        type: 'pat.asset.transferred',
        version: 1,
        description: 'O bem mudou de lugar — de onde (carimbado pelo servidor) para onde.',
      },
      {
        type: 'pat.asset.retired',
        version: 1,
        description: 'O bem foi baixado — terminal, com a razão escrita. O que volta é aquisição nova.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): o mnt aponta para cá por ID
     * SOLTO e nada aqui precisa escutar ninguém. Sem handler, sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'pat.asset.manage',
  decide: 'pat.asset.decide',
  setup: 'pat.setup.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'pat.asset.registered',
  updated: 'pat.asset.updated',
  transferred: 'pat.asset.transferred',
  writtenOff: 'pat.asset.retired',
} as const;
