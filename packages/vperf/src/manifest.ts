import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 46 — Avaliação de Fornecedores.
 *
 * `id` = `vperf` (o cinto de `emit_event` confere o prefixo `vperf.*`).
 * Domain `procurement` (Compras). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **O DIVERGE do `perf`.** O `perf` (Módulo 36) avalia GENTE dentro de um
 * CICLO (`open → closed`) — a avaliação de RH pertence a uma época. Aqui a
 * avaliação de FORNECEDOR é PONTUAL: não há ciclo a abrir/fechar, é um ato
 * consumado e isolado. Mantém-se a identidade avaliador × avaliado; diverge a
 * moldura temporal. Ver `docs/canon/MODULO-VPERF-SPEC.md §0`.
 *
 * @see docs/canon/MODULO-VPERF-SPEC.md
 * @see supabase/migrations/0061_vperf.sql
 */
export const MANIFEST = {
  id: 'vperf',
  name: 'Avaliação de Fornecedores',
  version: '0.1.0',
  summary:
    'A avaliação PONTUAL do fornecedor pelo comprador: nota 0–100 obrigatória (a régua do método), parecer em texto livre e a origem em texto livre (recebimento, cotação). Ato imutável, carimbado pelo servidor — diferente da avaliação de desempenho de gente, que pertence a um ciclo. Scorecard estruturado e homologação formal ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'procurement' },

  capabilities: [{ key: 'supplier-appraisals', canonicalName: 'Avaliação de fornecedores' }],

  permissions: [
    {
      key: 'vperf.appraisal.record',
      moduleId: 'vperf',
      description:
        'Registrar avaliações de fornecedor — ato imutável, com nota 0–100 e o avaliador carimbado pelo servidor.',
    },
  ],

  events: {
    emits: [
      {
        type: 'vperf.appraisal.recorded',
        version: 1,
        description:
          'Uma avaliação de fornecedor foi registrada — fornecedor (id solto + nome), nota e origem no envelope. O parecer não vai no correio.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler existe nesta onda.
     * Consumo óbvio (ex.: escutar `vendor.supplier.registered` para pré-listar
     * fornecedores a avaliar) é futuro DECLARADO na spec §5, sem handler e sem
     * promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  record: 'vperf.appraisal.record',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  recorded: 'vperf.appraisal.recorded',
} as const;
