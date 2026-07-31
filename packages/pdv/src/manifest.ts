import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do Módulo 71 — Ponto de Venda (PDV).**
 *
 * ⚠️ **Por que o `id` é `pdv`.** Curto, greppável e neutro — o cinto de
 * `emit_event` confere o prefixo `pdv.*`. ⭐ E é o PRIMEIRO módulo do Vertical
 * `retail` (Varejo & Supermercados): `taxonomy.layer = 'vertical'`.
 *
 * ⛔ Registra a VENDA COMERCIAL, NÃO o documento fiscal (NF-e/NFC-e é
 * integração fiscal certificada — Lei 3). `consumes` VAZIO.
 *
 * @see docs/canon/MODULO-PDV-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0086_pdv.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'pdv',
  name: 'Ponto de Venda (PDV)',
  version: '0.1.0',
  summary:
    'A venda comercial do balcão (o cupom): cabeçalho + itens, cliente por id solto ao crm (opcional) e produto por id solto ao catalog. Finalizar CONGELA a venda; draft → completed/cancelled são terminais — venda cancelada não reabre (o DIVERGE do rfq, que tem o meio-termo open). Promoções entram como um campo de desconto simples; NF-e/NFC-e é integração fiscal (Lei 3), fora. consumes vazio.',

  /**
   * ⭐ **Vertical `retail` — Taxonomia §6, "🛒 Varejo & Supermercados"**,
   * capacidade *PDV*. É o PRIMEIRO cartão deste vertical no catálogo; a chave
   * é a VerticalKey do `@alsham/core` — a Store gradua a pill de Varejo por
   * ela (confirmado na store-taxonomy).
   */
  taxonomy: { layer: 'vertical', vertical: 'retail' },

  capabilities: [{ key: 'pos', canonicalName: 'PDV' }],

  /**
   * UMA permissão só (a migration tem só `pdv.sale.manage`): montar a venda,
   * incluir/editar itens no rascunho, finalizar e cancelar são a mesma mão.
   */
  permissions: [
    {
      key: 'pdv.sale.manage',
      moduleId: 'pdv',
      description: 'Montar a venda, incluir e editar itens no rascunho, finalizar o cupom e cancelar.',
    },
  ],

  events: {
    emits: [
      {
        type: 'pdv.sale.registered',
        version: 1,
        description: 'Uma venda nasceu (sempre em rascunho).',
      },
      {
        type: 'pdv.sale.completed',
        version: 1,
        description: 'A venda foi finalizada — o cupom fechou e congelou. Terminal.',
      },
      {
        type: 'pdv.sale.cancelled',
        version: 1,
        description: 'A venda foi cancelada, com razão. Terminal.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler nesta onda. Baixa de
     * estoque (o `inv` genérico), fiscal (NF-e/NFC-e) e fidelidade são futuro
     * DECLARADO, sem handler e sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'pdv.sale.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'pdv.sale.registered',
  completed: 'pdv.sale.completed',
  cancelled: 'pdv.sale.cancelled',
} as const;
