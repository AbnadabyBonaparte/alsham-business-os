import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do Módulo 82 — Assinatura de Energia (Subscription).**
 *
 * `id` = `subscription` (o cinto de `emit_event` confere o prefixo
 * `subscription.*`). ⭐ É módulo VERTICAL do catálogo: `taxonomy.layer =
 * 'vertical'`, `vertical` `energy` (☀️ Energia). `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ O modelo de negócio central da Curva C solar: o consumidor assina uma FATIA
 * (percentual) da geração de uma usina. Cliente por id solto ao `crm`
 * (obrigatório), usina por id solto ao `plant` (obrigatório), `allocation_percent`
 * 0 < x <= 100.
 *
 * ⭐ `active → cancelled` TERMINAL — a física do `proj`: quem re-assina negocia
 * OUTRA fatia, então o retorno é assinatura NOVA (o DIVERGE consciente do
 * `catalog`, onde `archived → active` existe). Cancelar exige razão e a permissão
 * `.decide`. NASCE ATIVA (sem pending — o intermediário seria viés de UMA
 * distribuidora).
 *
 * @see docs/canon/MODULO-SUBSCRIPTION-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0097_subscription.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'subscription',
  name: 'Assinatura de Energia',
  version: '0.1.0',
  summary:
    'O modelo de negócio central da Curva C solar: o consumidor assina uma FATIA (percentual) da geração de uma usina. Cliente por id solto ao crm (obrigatório), usina por id solto ao plant (obrigatório), allocation_percent 0<x<=100. ⭐⭐ NASCE ATIVA — não há pending (o intermediário "assinada, aguardando conexão" seria viés de UMA distribuidora, não do produto). active → cancelled TERMINAL: quem re-assina negocia OUTRA fatia — o retorno é assinatura NOVA (a física do proj, o DIVERGE consciente do catalog). Cancelar exige razão e a permissão .decide. Desconto na fatura e faturamento ficam FORA. consumes VAZIO.',

  /**
   * ⭐ **Vertical `energy` — Taxonomia §6, "☀️ Energia (8)"**, capacidade
   * *Assinatura de energia*. A chave é a `VerticalKey` do `@alsham/core` — a Store
   * gradua a pill de Energia por ela (store-taxonomy `key: 'energy'`).
   */
  taxonomy: { layer: 'vertical', vertical: 'energy' },

  capabilities: [
    { key: 'energy-subscription', canonicalName: 'Assinatura de energia' },
  ],

  permissions: [
    {
      key: 'subscription.subscription.manage',
      moduleId: 'subscription',
      description: 'Cadastrar e editar assinaturas (cliente, usina, percentual de alocação).',
    },
    {
      key: 'subscription.subscription.decide',
      moduleId: 'subscription',
      description: 'Cancelar uma assinatura, com razão — o fim é terminal.',
    },
  ],

  events: {
    emits: [
      {
        type: 'subscription.subscription.registered',
        version: 1,
        description: 'Uma assinatura nasceu (sempre ativa).',
      },
      {
        type: 'subscription.subscription.updated',
        version: 1,
        description: 'Os dados de uma assinatura mudaram (nome, usina, percentual).',
      },
      {
        type: 'subscription.subscription.cancelled',
        version: 1,
        description: 'A assinatura foi cancelada, com razão. Terminal — quem volta assina outra.',
      },
    ],

    /** VAZIO por decisão de canon (Lei 7): nenhum handler de assinatura existe. */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'subscription.subscription.manage',
  decide: 'subscription.subscription.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'subscription.subscription.registered',
  updated: 'subscription.subscription.updated',
  cancelled: 'subscription.subscription.cancelled',
} as const;
