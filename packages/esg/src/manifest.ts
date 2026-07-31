import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 67 — Métricas Ambientais (ESG).
 *
 * `id` = `esg` (o cinto de `emit_event` confere o prefixo `esg.*`).
 * Domain `esg` (ESG & Sustentabilidade — território novo). `consumes` VAZIO
 * (Lei 7).
 *
 * ⭐⭐ A DECISÃO DE CANON: UM módulo para as quatro capacidades de medição do
 * Domain (Inventário de carbono, Consumo de água, Consumo de energia, Gestão de
 * resíduos) — na física são a mesma leitura periódica, distinguidas pelo
 * `metric_type` (CHECK das quatro dimensões). *Indicadores ESG* é o `goal` e
 * *Relatórios ESG* é o `pol` — ambos DECLARADOS FORA, zero módulo novo.
 *
 * ⭐⭐ A física é a do LANÇAMENTO IMUTÁVEL (o `pcost`/`timesheet`/`recv`): a
 * leitura é fato consumado — nasce e nunca muda; corrigir é registrar outra.
 *
 * @see docs/canon/MODULO-ESG-SPEC.md
 * @see supabase/migrations/0082_esg.sql
 */
export const MANIFEST = {
  id: 'esg',
  name: 'Métricas Ambientais',
  version: '0.1.0',
  summary:
    'O livro de leituras ambientais da empresa: cada leitura é um ato imutável — o tipo da métrica (carbono/água/energia/resíduo), a quantidade (sempre >= 0), a unidade (texto livre: tCO2e, m³, kWh, kg), a data de referência e uma fonte opcional por id solto. As quatro capacidades de medição do Domain viram UM módulo, porque na física são a mesma leitura periódica; o tipo é um CHECK das quatro dimensões clássicas. Registrar é fato consumado; corrigir é registrar outra leitura, nunca reescrever. Indicadores ESG são o goal e Relatórios ESG são o pol (ambos fora). Cálculo de pegada por fórmula/fator de emissão e certificação de terceira parte ficam de fora (motor futuro; e o audit por id solto).',

  taxonomy: { layer: 'domain', domain: 'esg' },

  capabilities: [{ key: 'esg', canonicalName: 'Inventário de carbono' }],

  permissions: [
    {
      key: 'esg.reading.record',
      moduleId: 'esg',
      description: 'Registrar uma leitura ambiental — o tipo da métrica, a quantidade, a unidade e o período.',
    },
  ],

  events: {
    emits: [
      {
        type: 'esg.reading.recorded',
        version: 1,
        description: 'Uma leitura ambiental foi registrada. Ato imutável desde o instante 1.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  record: 'esg.reading.record',
} as const;

export const EVENTS = {
  recorded: 'esg.reading.recorded',
} as const;
