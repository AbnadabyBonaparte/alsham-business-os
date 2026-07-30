import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Metas.**
 *
 * ⚠️ **Por que o `id` é `goal`.** Curto, greppável, o nome consagrado do
 * ofício — conferido por grep com fronteira de palavra: zero colisões
 * (`meta` colidiria com o vocabulário de HTML/build e com a empresa
 * homônima; Sol Único agradece).
 *
 * ⚠️ **Por que o Domain é `bi`.** "Metas" existe na Taxonomia em três
 * lugares: o bloco do 📊 BI (Dashboards · KPIs · Indicadores · METAS) é o
 * da LEITURA do negócio — e este módulo é a peça de ESCRITA desse bloco:
 * o alvo declarado e o livro de check-ins. A *Metas* do CRM é o recorte
 * comercial (uma meta com métrica "vendas"); os *OKRs* do RH são a
 * cascata de gente — futuro declarado.
 *
 * @see docs/canon/MODULO-GOAL-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0038_goal.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'goal',
  name: 'Metas',
  version: '0.1.0',
  summary:
    'A ambição declarada do tenant: métrica em texto livre, alvo opcional que congela na ativação, check-ins como atos imutáveis — e o progresso sempre como o último check-in, calculado. Bater ou perder é decisão de gente, carimbada.',

  /** ⭐ Domain `bi` — ver o argumento acima. */
  taxonomy: { layer: 'domain', domain: 'bi' },

  capabilities: [{ key: 'goals', canonicalName: 'Metas' }],

  /**
   * Três permissões — o placar tem três mãos: quem declara a ambição não
   * é quem reporta o número, nem quem fecha a época.
   */
  permissions: [
    {
      key: 'goal.goal.manage',
      moduleId: 'goal',
      description: 'Declarar metas, editar o rascunho, ativar e atribuir dono.',
    },
    {
      key: 'goal.goal.report',
      moduleId: 'goal',
      description: 'Registrar check-ins — o número na mesa, ato carimbado e imutável.',
    },
    {
      key: 'goal.goal.decide',
      moduleId: 'goal',
      description: 'Fechar a época: batida, perdida (com check-in na mesa) ou cancelada com razão.',
    },
  ],

  events: {
    emits: [
      {
        type: 'goal.goal.opened',
        version: 1,
        description: 'Uma ambição foi declarada — no rascunho, ainda sem correr.',
      },
      {
        type: 'goal.goal.activated',
        version: 1,
        description: 'A meta passou a correr — alvo, métrica e período congelaram.',
      },
      {
        type: 'goal.goal.updated',
        version: 1,
        description: 'A meta mudou no que segue vivo: título, dono, descrição.',
      },
      {
        type: 'goal.goal.reported',
        version: 1,
        description: 'Um check-in entrou no livro — o número, a nota e o carimbo.',
      },
      {
        type: 'goal.goal.achieved',
        version: 1,
        description: 'A época fechou BATIDA — decisão de gente, com número na mesa. Terminal.',
      },
      {
        type: 'goal.goal.missed',
        version: 1,
        description: 'A época fechou PERDIDA — decisão de gente, com número na mesa. Terminal.',
      },
      {
        type: 'goal.goal.cancelled',
        version: 1,
        description: 'A ambição foi desistida — com a razão escrita. Terminal.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): medir automático seria consumir
     * eventos de outros módulos — handler que esta onda não constrói.
     * Quem reporta é gente.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'goal.goal.manage',
  report: 'goal.goal.report',
  decide: 'goal.goal.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  opened: 'goal.goal.opened',
  activated: 'goal.goal.activated',
  updated: 'goal.goal.updated',
  reported: 'goal.goal.reported',
  achieved: 'goal.goal.achieved',
  missed: 'goal.goal.missed',
  cancelled: 'goal.goal.cancelled',
} as const;
