import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 45 — Recebimento (Goods Receipt).
 *
 * `id` = `recv` (o cinto de `emit_event` confere o prefixo `recv.*`).
 * Domain `procurement` (Compras). `consumes` VAZIO (Lei 7).
 *
 * @see docs/canon/MODULO-RECV-SPEC.md
 * @see supabase/migrations/0060_recv.sql
 */
export const MANIFEST = {
  id: 'recv',
  name: 'Recebimento',
  version: '0.1.0',
  summary:
    'O livro de recebimentos da empresa: cada recebimento é um ato pontual imutável — o que chegou (texto livre), quanto e quando. Receber a maior é permitido (a sobra é fato, a mesma física do overpay do ar); o módulo não lê o pedido, então não há quantidade pedida para comparar. O vínculo com o pedido é por id solto + referência. Conciliação recebimento→pedido/AP fica de fora.',

  taxonomy: { layer: 'domain', domain: 'procurement' },

  capabilities: [{ key: 'goods-receipt', canonicalName: 'Recebimento' }],

  permissions: [
    {
      key: 'recv.receipt.record',
      moduleId: 'recv',
      description: 'Registrar um recebimento — o que chegou, quanto e quando.',
    },
  ],

  events: {
    emits: [
      {
        type: 'recv.receipt.recorded',
        version: 1,
        description: 'Um recebimento foi registrado. Ato pontual, imutável desde o instante 1.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  record: 'recv.receipt.record',
} as const;

export const EVENTS = {
  recorded: 'recv.receipt.recorded',
} as const;
