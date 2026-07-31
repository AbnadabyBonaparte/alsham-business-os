import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 52 — Performance Logística.
 *
 * `id` = `logperf` (o cinto de `emit_event` confere o prefixo `logperf.*`).
 * Domain `supply-chain` (Supply Chain) — território SEPARADO de Compras
 * (Taxonomia §5). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **O REUSO do `vperf` e o DIVERGE assinado.** O `vperf` (Módulo 46) é a
 * avaliação PONTUAL e IMUTÁVEL do FORNECEDOR (nota 0–100, sem ciclo, avaliador
 * carimbado). Aqui a física é a MESMA — mas o AVALIADO diverge: não é um
 * fornecedor (`supplier_id`), é uma rota/transportadora/CD em TEXTO LIVRE
 * (`subject`), com um vínculo OPCIONAL a um centro por id solto (`dc_center_id`,
 * nullable). Ver `docs/canon/MODULO-LOGPERF-SPEC.md §0`.
 *
 * @see docs/canon/MODULO-LOGPERF-SPEC.md
 * @see supabase/migrations/0067_logperf.sql
 */
export const MANIFEST = {
  id: 'logperf',
  name: 'Performance Logística',
  version: '0.1.0',
  summary:
    'A avaliação PONTUAL da performance logística: nota 0–100 obrigatória (a régua do método), parecer em texto livre e o avaliado em texto livre (uma rota, uma transportadora, um centro de distribuição), com vínculo OPCIONAL a um centro por id solto. Ato imutável, carimbado pelo servidor — o REUSO do vperf, cujo avaliado é um fornecedor. Scorecard estruturado e KPIs calculados de OTIF/lead time ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'supply-chain' },

  capabilities: [{ key: 'logistics-performance', canonicalName: 'Performance logística' }],

  permissions: [
    {
      key: 'logperf.appraisal.record',
      moduleId: 'logperf',
      description:
        'Registrar avaliações de performance logística — ato imutável, com nota 0–100 e o avaliador carimbado pelo servidor.',
    },
  ],

  events: {
    emits: [
      {
        type: 'logperf.appraisal.recorded',
        version: 1,
        description:
          'Uma avaliação de performance logística foi registrada — o avaliado (subject + id solto opcional do centro), a nota e a data no envelope. O parecer não vai no correio.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler existe nesta onda.
     * Consumo óbvio (ex.: KPIs de OTIF calculados de eventos de entrega) é
     * futuro DECLARADO na spec §5, sem handler e sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  record: 'logperf.appraisal.record',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  recorded: 'logperf.appraisal.recorded',
} as const;
