import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Gestão de Lojistas.**
 *
 * ⚠️ **Por que o `id` é `mall`.** Curto, greppável e neutro (fronteira de
 * palavra: zero colisões com a frota da campanha). ⭐ E é o PRIMEIRO módulo
 * VERTICAL do catálogo: `taxonomy.layer = 'vertical'`.
 *
 * @see docs/canon/MODULO-MALL-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0053_mall.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'mall',
  name: 'Gestão de Lojistas',
  version: '0.1.0',
  summary:
    'Os lojistas do shopping: segmento TEXTO LIVRE (nunca enum), a unidade física por id solto ao spc (não recria cadastro de espaço). O lojista é relação comercial que volta — active ↔ archived (o DIVERGE do hr).',

  /**
   * ⭐ **Vertical `shopping-centers` — Taxonomia §6, "🛍 Shopping Centers
   * (9)"**, capacidade *Lojistas*. É o PRIMEIRO cartão vertical do catálogo;
   * a chave é a VerticalKey do `@alsham/core` — a Store gradua a pill de
   * Shopping Centers por ela.
   */
  taxonomy: { layer: 'vertical', vertical: 'shopping-centers' },

  capabilities: [{ key: 'store-tenants', canonicalName: 'Lojistas' }],

  /**
   * Duas permissões — cadastrar/editar é uma mão (manage); ARQUIVAR/REABRIR
   * é decisão à parte (decide), que tira/põe o lojista no mapa do mall.
   */
  permissions: [
    {
      key: 'mall.store.manage',
      moduleId: 'mall',
      description: 'Cadastrar lojistas e editar dados (nome, segmento, unidade física por id solto).',
    },
    {
      key: 'mall.store.decide',
      moduleId: 'mall',
      description: 'Arquivar ou reabrir um lojista — tira/põe no mapa do mall.',
    },
  ],

  events: {
    emits: [
      {
        type: 'mall.store.registered',
        version: 1,
        description: 'Um lojista foi cadastrado — nome, segmento e a unidade pelo nome carimbado.',
      },
      {
        type: 'mall.store.updated',
        version: 1,
        description: 'Os dados do lojista mudaram.',
      },
      {
        type: 'mall.store.archived',
        version: 1,
        description: 'O lojista saiu do mapa do mall — reversível.',
      },
      {
        type: 'mall.store.reopened',
        version: 1,
        description: 'O lojista voltou ao mapa — a mesma relação comercial.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler de shopping existe
     * nesta onda. Catálogo de produtos e comissão sobre vendas são futuro
     * DECLARADO na spec §5, sem handler e sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'mall.store.manage',
  decide: 'mall.store.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'mall.store.registered',
  updated: 'mall.store.updated',
  archived: 'mall.store.archived',
  reopened: 'mall.store.reopened',
} as const;
