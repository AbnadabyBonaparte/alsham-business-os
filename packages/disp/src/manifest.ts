import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 51 — Distribuição / Despacho (Dispatch).
 *
 * `id` = `disp` (o cinto de `emit_event` confere o prefixo `disp.*`).
 * Domain `supply-chain` (Supply Chain) — território SEPARADO de Compras
 * (Taxonomia §5). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **O ESPELHO INVERTIDO do `recv`.** O `recv` (Módulo 45) é a CHEGADA — o
 * livro de recebimentos. O `disp` é a SAÍDA — o livro de despachos. Mesma
 * física do ato pontual imutável (fato consumado, sem ciclo, sem status).
 *
 * @see docs/canon/MODULO-DISP-SPEC.md
 * @see supabase/migrations/0066_disp.sql
 */
export const MANIFEST = {
  id: 'disp',
  name: 'Despacho',
  version: '0.1.0',
  summary:
    'O livro de despachos da empresa: cada despacho é um ato pontual imutável — o que saiu, para onde (destino, texto livre), por qual transportadora, quanto e quando. É o espelho invertido do recebimento (o recv é a chegada; o disp é a saída). O vínculo com o centro de distribuição é por id solto + nome carimbado pela tela. Roteirização, rastreio e conciliação despacho→pedido/estoque ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'supply-chain' },

  capabilities: [{ key: 'distribution', canonicalName: 'Distribuição' }],

  permissions: [
    {
      key: 'disp.dispatch.record',
      moduleId: 'disp',
      description: 'Registrar um despacho — o que saiu, para onde, quanto e quando.',
    },
  ],

  events: {
    emits: [
      {
        type: 'disp.dispatch.recorded',
        version: 1,
        description: 'Um despacho foi registrado. Ato pontual, imutável desde o instante 1.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  record: 'disp.dispatch.record',
} as const;

export const EVENTS = {
  recorded: 'disp.dispatch.recorded',
} as const;
