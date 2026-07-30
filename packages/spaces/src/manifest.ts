import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Reserva de Espaços.**
 *
 * ⚠️ **Por que o `id` é `spc`.** `spaces` colide com o vocabulário de todo
 * editor e SO (workspace, namespace); `space` idem. `spc` é curto,
 * greppável e neutro — conferido por grep com fronteira de palavra: zero
 * colisões.
 *
 * @see docs/canon/MODULO-SPC-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0035_spc.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'spc',
  name: 'Reserva de Espaços',
  version: '0.1.0',
  summary:
    'Os espaços do tenant e a agenda deles: período meio-aberto, conflito recusado pelo BANCO (exclusion constraint — a cancelada libera sozinha), o passado permitido como fato consumado e o cancelamento com razão escrita.',

  /**
   * ⭐ **Domain `operations` — Taxonomia §5, "🏭 Operações (10)"**, a
   * leitura universal de *Facilities*: o vertical Condomínios chama de
   * "Reserva de áreas comuns", Hotelaria de "Reservas" — ver a spec §0.
   */
  taxonomy: { layer: 'domain', domain: 'operations' },

  capabilities: [{ key: 'space-booking', canonicalName: 'Reserva de espaços' }],

  /**
   * Duas permissões — a agenda tem uma mão (reservar e desmarcar, com
   * razão); o desenho dos espaços tem outra.
   */
  permissions: [
    {
      key: 'spc.reservation.manage',
      moduleId: 'spc',
      description: 'Reservar períodos, remarcar e cancelar com razão escrita.',
    },
    {
      key: 'spc.setup.manage',
      moduleId: 'spc',
      description: 'Desenhar os espaços do tenant — nome livre, capacidade opcional; arquivado volta.',
    },
  ],

  events: {
    emits: [
      {
        type: 'spc.reservation.booked',
        version: 1,
        description: 'Um período foi prometido — espaço pelo nome, início e fim no envelope.',
      },
      {
        type: 'spc.reservation.updated',
        version: 1,
        description: 'A reserva mudou no que é FATO: período, finalidade, espaço.',
      },
      {
        type: 'spc.reservation.cancelled',
        version: 1,
        description: 'A reserva foi cancelada — terminal, com a razão escrita. O período ficou livre sozinho.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): preço/cobrança da reserva viraria
     * título no ar — integração DECLARADA na spec §5, sem handler e sem
     * promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'spc.reservation.manage',
  setup: 'spc.setup.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  booked: 'spc.reservation.booked',
  updated: 'spc.reservation.updated',
  cancelled: 'spc.reservation.cancelled',
} as const;
