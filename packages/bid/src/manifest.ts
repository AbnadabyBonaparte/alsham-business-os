import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 92 — Licitações (Bid).
 *
 * `id` = `bid` (o cinto de `emit_event` confere o prefixo `bid.*`). ⭐ É módulo
 * VERTICAL do catálogo: `taxonomy.layer = 'vertical'`, `vertical` `government`
 * (🏛 Governo). `consumes` VAZIO (Lei 7).
 *
 * ⭐ A IDENTIDADE é a do `rfq` — "quem CONDUZ decide, não o fornecedor" —
 * RE-PERGUNTADA para a compra PÚBLICA. A licitação nasce `draft`, PUBLICAR o
 * edital (draft→open) CONGELA o conteúdo, e os fins são TERMINAIS. O DIVERGE
 * assinado do `rfq`: o terminal não é `awarded` — é **`homologated`**
 * (homologação/adjudicação, o ato solene da Lei 14.133).
 *
 * @see docs/canon/MODULO-BID-SPEC.md — o fluxo de negócio
 * @see docs/canon/ONDA-GOVERNO-DECISOES.md — capacidade #3 (Licitações)
 * @see supabase/migrations/0107_bid.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'bid',
  name: 'Licitações',
  version: '0.1.0',
  summary:
    'A licitação pública ancorada num EDITAL: o órgão publica o que precisa (itens em texto livre), recebe as propostas dos licitantes e, ao final, HOMOLOGA um vencedor ou cancela. Publicar o edital congela o conteúdo; homologar e cancelar são terminais. ⭐ A identidade é a do rfq (quem conduz decide, não o fornecedor), com o DIVERGE assinado: o terminal é homologated (o ato solene da Lei 14.133), não o awarded do rfq. A modalidade (pregão, concorrência…) é TEXTO LIVRE, nunca enum — muda por lei. ⛔ Publicação no PNCP (Portal Nacional de Contratações Públicas) é integração certificada com o Estado, FORA (Lei 3). consumes VAZIO.',

  /**
   * ⭐ **Vertical `government` — Taxonomia §6, "🏛 Governo (8)"**, capacidade
   * *Licitações*. A chave é a `VerticalKey` do `@alsham/core` — a Store gradua a
   * pill de Governo por ela (store-taxonomy `key: 'government'`).
   */
  taxonomy: { layer: 'vertical', vertical: 'government' },

  capabilities: [{ key: 'tenders', canonicalName: 'Licitações' }],

  permissions: [
    {
      key: 'bid.tender.manage',
      moduleId: 'bid',
      description: 'Criar e editar a licitação em rascunho, incluir itens, publicar o edital, registrar propostas e cancelar.',
    },
    {
      key: 'bid.tender.homologate',
      moduleId: 'bid',
      description: 'Homologar o licitante vencedor — o ato de decisão da licitação (Lei 14.133).',
    },
  ],

  events: {
    emits: [
      {
        type: 'bid.tender.registered',
        version: 1,
        description: 'Uma licitação nasceu (sempre em rascunho).',
      },
      {
        type: 'bid.tender.opened',
        version: 1,
        description: 'O edital foi publicado (aberto para propostas) — o conteúdo congelou.',
      },
      {
        type: 'bid.tender.homologated',
        version: 1,
        description: 'O órgão homologou um licitante vencedor. Terminal.',
      },
      {
        type: 'bid.tender.cancelled',
        version: 1,
        description: 'A licitação foi encerrada sem vencedor, com razão. Terminal.',
      },
    ],

    /** VAZIO por decisão de canon (Lei 7): nenhum handler de licitação existe. */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'bid.tender.manage',
  homologate: 'bid.tender.homologate',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'bid.tender.registered',
  opened: 'bid.tender.opened',
  homologated: 'bid.tender.homologated',
  cancelled: 'bid.tender.cancelled',
} as const;
