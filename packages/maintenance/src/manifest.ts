import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Manutenção.**
 *
 * ⚠️ **Por que o `id` é `mnt`.** `maintenance` inteiro não é greppável no
 * padrão dos eventos; `manut` é meio-idioma. `mnt` é a abreviação
 * consagrada do ofício, curta e neutra — conferida por grep com fronteira
 * de palavra: zero colisões.
 *
 * @see docs/canon/MODULO-MNT-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0032_mnt.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'mnt',
  name: 'Manutenção',
  version: '0.1.0',
  summary:
    'As ordens de manutenção do tenant: corretiva e preventiva, alvo em texto livre, prioridade desenhada pelo tenant, conclusão com relato carimbado — e a preventiva com recorrência e a próxima devida sempre calculada.',

  /**
   * ⭐ **Domain `operations` — Taxonomia §5, "🏭 Operações (10)"**,
   * capacidade *Manutenção*. Facilities e Patrimônio são capacidades
   * vizinhas (Patrimônio é a Onda 2 — o vínculo já nasce solto).
   */
  taxonomy: { layer: 'domain', domain: 'operations' },

  capabilities: [{ key: 'maintenance', canonicalName: 'Manutenção' }],

  /**
   * Três permissões: quem abre e move não é quem dá o serviço por
   * concluído — e a régua de urgência tem dona própria.
   */
  permissions: [
    {
      key: 'mnt.order.manage',
      moduleId: 'mnt',
      description: 'Abrir, editar, atribuir e mover ordens de manutenção.',
    },
    {
      key: 'mnt.order.complete',
      moduleId: 'mnt',
      description: 'Concluir (com o relato do que foi feito) e cancelar ordens — atos carimbados.',
    },
    {
      key: 'mnt.setup.manage',
      moduleId: 'mnt',
      description: 'Desenhar a régua de prioridade do tenant — nome livre e posição, nunca enum.',
    },
  ],

  events: {
    emits: [
      {
        type: 'mnt.order.opened',
        version: 1,
        description: 'Uma ordem nasceu — corretiva ou preventiva, com o alvo em texto.',
      },
      {
        type: 'mnt.order.updated',
        version: 1,
        description: 'A ordem mudou no que é FATO: alvo, prioridade, responsável, custo, andamento.',
      },
      {
        type: 'mnt.order.completed',
        version: 1,
        description: 'O serviço foi concluído — com o relato do que foi feito, carimbado.',
      },
      {
        type: 'mnt.order.reopened',
        version: 1,
        description: 'O MESMO serviço voltou à bancada — a vistoria reprovou o reparo.',
      },
      {
        type: 'mnt.order.cancelled',
        version: 1,
        description: 'A ordem foi cancelada — terminal. A falha nova é ordem nova.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): peças/estoque consumido viraria
     * consumo do `inv` — integração DECLARADA na spec §5, que exige o
     * vínculo linha↔item que hoje não existe. Sem handler, sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'mnt.order.manage',
  complete: 'mnt.order.complete',
  setup: 'mnt.setup.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  opened: 'mnt.order.opened',
  updated: 'mnt.order.updated',
  completed: 'mnt.order.completed',
  reopened: 'mnt.order.reopened',
  cancelled: 'mnt.order.cancelled',
} as const;
