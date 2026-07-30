import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Avaliação de Desempenho.**
 *
 * ⚠️ **Por que o `id` é `perf`.** Curto e greppável (fronteira de palavra:
 * zero colisões com a frota da campanha), do jeito que `ops`, `hr` e `dre`
 * ocuparam o nome do bloco que abriram. O quarto módulo do BLOCO DE PESSOAS.
 *
 * ⚠️ **`perf` não é `goal`.** `goal` (Módulo 23) mede a PRÓPRIA ambição
 * declarada — o mesmo lado da mesa reporta o número e decide o desfecho.
 * Aqui há DOIS papéis: um AVALIADOR julga o trabalho de um AVALIADO. Nunca
 * a mesma coisa — ver `docs/canon/MODULO-PERF-SPEC.md §0`.
 *
 * @see docs/canon/MODULO-PERF-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0051_perf.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'perf',
  name: 'Avaliação de Desempenho',
  version: '0.1.0',
  summary:
    'O julgamento do trabalho de alguém por outra pessoa — dois papéis (avaliador e avaliado), diferente da meta que o próprio declara. Ciclo TEXTO LIVRE (trimestral/anual); a avaliação é ato imutável, carimbado pelo servidor; o ciclo fechado é terminal — o próximo é ciclo novo. OKRs estruturados ficam FORA.',

  /**
   * ⭐ **Domain `perf` — Taxonomia §5, "👥 RH (14)"**. Cobre a capacidade
   * *Avaliação*; a capacidade-irmã *OKRs* segue NÃO CONSTRUÍDA (spec §5) —
   * cascata de metas de gente é ofício próprio, e `goal` já cobre a
   * leitura genérica de ambição.
   */
  taxonomy: { layer: 'domain', domain: 'hr' },

  capabilities: [{ key: 'appraisals', canonicalName: 'Avaliação' }],

  /**
   * Duas permissões — o ciclo (abrir/fechar) é decisão de quem administra o
   * processo; registrar a avaliação é ato de quem avalia. Nunca a mesma mão.
   */
  permissions: [
    {
      key: 'perf.cycle.manage',
      moduleId: 'perf',
      description: 'Abrir e fechar ciclos de avaliação (o ciclo é dado do tenant).',
    },
    {
      key: 'perf.review.manage',
      moduleId: 'perf',
      description:
        'Registrar avaliações — ato imutável, ligado ao ciclo, com o avaliador carimbado pelo servidor.',
    },
  ],

  events: {
    emits: [
      {
        type: 'perf.cycle.opened',
        version: 1,
        description: 'Um ciclo de avaliação foi aberto — nome (dado do tenant) no envelope.',
      },
      {
        type: 'perf.cycle.closed',
        version: 1,
        description: 'O ciclo foi fechado — terminal, o próximo é ciclo novo.',
      },
      {
        type: 'perf.review.recorded',
        version: 1,
        description:
          'Uma avaliação foi registrada — avaliado (id solto + nome), avaliador carimbado, nota opcional. O parecer não vai no envelope.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler de RH existe nesta
     * onda. Consumo óbvio (ex.: encerrar avaliações pendentes ao desligar um
     * colaborador no `hr`) é futuro DECLARADO na spec §5, sem handler e sem
     * promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  cycleManage: 'perf.cycle.manage',
  reviewManage: 'perf.review.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  cycleOpened: 'perf.cycle.opened',
  cycleClosed: 'perf.cycle.closed',
  reviewRecorded: 'perf.review.recorded',
} as const;
