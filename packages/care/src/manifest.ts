import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Atendimento.**
 *
 * ⚠️ **Por que o `id` é `care`.** `cx` é o Domain inteiro (a armadilha do
 * `finance`); `sac` é sigla de um país e de uma década; `ticket` é
 * vocabulário do VERTICAL de eventos (ingresso). `care` é curto, greppável
 * e foi conferido por grep com fronteira de palavra: zero colisões.
 *
 * @see docs/canon/MODULO-CARE-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0030_care.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'care',
  name: 'Atendimento',
  version: '0.1.0',
  summary:
    'O balcão de atendimento do tenant: casos com solicitante neutro, categoria e prioridade desenhadas pelo tenant, conversa imutável, resolução carimbada — e reabertura honesta: o caso que volta é o mesmo caso.',

  /**
   * ⭐ **Domain `cx` — Taxonomia §5, "💬 Atendimento ao Cliente (CX) (8)"**,
   * capacidade *SAC*. Omnichannel, Base de conhecimento, Pesquisas NPS/CSAT
   * e Pós-venda são capacidades PRÓPRIAS do mesmo Domain — não entram aqui.
   */
  taxonomy: { layer: 'domain', domain: 'cx' },

  capabilities: [{ key: 'service-desk', canonicalName: 'SAC' }],

  /**
   * Três permissões: quem atende não é quem dá o caso por resolvido — e o
   * vocabulário (categorias, prioridades) tem dona própria.
   */
  permissions: [
    {
      key: 'care.ticket.manage',
      moduleId: 'care',
      description: 'Abrir, editar, atribuir, mover e reabrir casos; registrar interações.',
    },
    {
      key: 'care.ticket.resolve',
      moduleId: 'care',
      description: 'Resolver e fechar casos — o ato fica carimbado com quem e quando, pelo servidor.',
    },
    {
      key: 'care.setup.manage',
      moduleId: 'care',
      description: 'Desenhar categorias e prioridades do tenant — nome livre, nunca enum do produto.',
    },
  ],

  events: {
    emits: [
      {
        type: 'care.ticket.opened',
        version: 1,
        description: 'Um caso nasceu — solicitante, classificação pelo nome, prazo se houver.',
      },
      {
        type: 'care.ticket.updated',
        version: 1,
        description: 'O caso mudou no que é FATO: assunto, classificação, responsável, prazo, andamento.',
      },
      {
        type: 'care.ticket.resolved',
        version: 1,
        description: 'O caso foi dado por resolvido — ato carimbado, com a nota de resolução.',
      },
      {
        type: 'care.ticket.reopened',
        version: 1,
        description: 'O MESMO caso voltou: o solicitante disse que não resolveu. O carimbo anterior fica na trilha.',
      },
      {
        type: 'care.ticket.closed',
        version: 1,
        description: 'O caso fechou — terminal. Quem volta depois é caso novo.',
      },
      {
        type: 'care.interaction.recorded',
        version: 1,
        description: 'Uma interação entrou na conversa — imutável, com canal em texto livre.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): não há fato de outro módulo que o
     * balcão precise projetar hoje. Abrir caso a partir de ocorrência ou de
     * evento é caminho declarado na spec §5 — exige handler completo.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'care.ticket.manage',
  resolve: 'care.ticket.resolve',
  setup: 'care.setup.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  opened: 'care.ticket.opened',
  updated: 'care.ticket.updated',
  resolved: 'care.ticket.resolved',
  reopened: 'care.ticket.reopened',
  closed: 'care.ticket.closed',
  interactionRecorded: 'care.interaction.recorded',
} as const;
