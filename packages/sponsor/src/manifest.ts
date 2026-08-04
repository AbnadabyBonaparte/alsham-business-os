import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Patrocínios.**
 *
 * ⚠️ **Por que o `id` é `sponsor`.** Curto, greppável, e neutro. ⭐ Módulo
 * VERTICAL do Eventos: `taxonomy.layer = 'vertical'`, `vertical = 'events'`.
 *
 * @see docs/canon/MODULO-SPONSOR-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0111_sponsor.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'sponsor',
  name: 'Patrocínios',
  version: '0.1.0',
  summary:
    'A camada de patrocínio do evento: o contrato jurídico vive no ctr (id solto), a negociação no deal (id solto) e o evento no evt (id solto); aqui mora só a cota (tier em texto livre, dado do tenant), o valor opcional e o checklist de entregáveis de ativação por evento (logo no palco, cortesias, ativação no foyer).',

  /**
   * ⭐ Vertical `events` — Taxonomia §6, "🎪 Eventos", capacidade *Patrocínios*.
   */
  taxonomy: { layer: 'vertical', vertical: 'events' },

  capabilities: [{ key: 'sponsorships', canonicalName: 'Patrocínios' }],

  /**
   * ⭐ Duas permissões, divididas por TABELA (como no lease agreement×report):
   * `sponsorship.manage` cobre registrar E arquivar/reabrir a cota (a relação
   * comercial não tem o par manage/decide do mall); `deliverable.manage` é o
   * checklist de ativação, à parte.
   */
  permissions: [
    {
      key: 'sponsor.sponsorship.manage',
      moduleId: 'sponsor',
      description:
        'Registrar o patrocínio (evento/contrato/contraparte por id solto, cota e valor) e arquivá-lo ou reabri-lo.',
    },
    {
      key: 'sponsor.deliverable.manage',
      moduleId: 'sponsor',
      description: 'Cadastrar os entregáveis de ativação do patrocínio e marcá-los como cumpridos.',
    },
  ],

  events: {
    emits: [
      {
        type: 'sponsor.sponsorship.registered',
        version: 1,
        description: 'Um patrocínio foi registrado — evento, contrato e contraparte por id solto, cota e valor.',
      },
      {
        type: 'sponsor.sponsorship.archived',
        version: 1,
        description: 'O patrocínio foi arquivado (a relação saiu do mapa; reversível).',
      },
      {
        type: 'sponsor.sponsorship.reopened',
        version: 1,
        description: 'O patrocínio arquivado voltou ao mapa — a mesma relação comercial.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): cruzar com `ctr.contract.*`,
     * `deal.*` ou `evt.*` é integração futura, declarada FORA na spec §5 —
     * sem handler, sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  sponsorshipManage: 'sponsor.sponsorship.manage',
  deliverableManage: 'sponsor.deliverable.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  sponsorshipRegistered: 'sponsor.sponsorship.registered',
  sponsorshipArchived: 'sponsor.sponsorship.archived',
  sponsorshipReopened: 'sponsor.sponsorship.reopened',
} as const;
