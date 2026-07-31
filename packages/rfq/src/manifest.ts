import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 44 — Cotações / RFQ.
 *
 * `id` = `rfq` (o cinto de `emit_event` confere o prefixo `rfq.*`).
 * Domain `procurement` (Compras). `consumes` VAZIO (Lei 7).
 *
 * @see docs/canon/MODULO-RFQ-SPEC.md
 * @see supabase/migrations/0059_rfq.sql
 */
export const MANIFEST = {
  id: 'rfq',
  name: 'Cotações',
  version: '0.1.0',
  summary:
    'O pedido de cotação (RFQ): a empresa pergunta ao mercado o que precisa (itens em texto livre) e, ao final, PREMIA um fornecedor vencedor ou cancela sem vencedor. Enviar congela o conteúdo; premiar e cancelar são terminais. O DIVERGE do quote: aqui quem decide é o comprador (awarded), não o cliente. Coleta estruturada de preços por fornecedor fica de fora.',

  taxonomy: { layer: 'domain', domain: 'procurement' },

  capabilities: [{ key: 'quotations', canonicalName: 'Cotações' }],

  permissions: [
    {
      key: 'rfq.request.manage',
      moduleId: 'rfq',
      description: 'Criar e editar a cotação em rascunho, incluir itens, enviar ao mercado e cancelar.',
    },
    {
      key: 'rfq.request.award',
      moduleId: 'rfq',
      description: 'Premiar o fornecedor vencedor — a decisão de compra da cotação.',
    },
  ],

  events: {
    emits: [
      {
        type: 'rfq.request.registered',
        version: 1,
        description: 'Uma cotação nasceu (sempre em rascunho).',
      },
      {
        type: 'rfq.request.opened',
        version: 1,
        description: 'A cotação foi enviada ao mercado (aberta para cotação) — o conteúdo congelou.',
      },
      {
        type: 'rfq.request.awarded',
        version: 1,
        description: 'O comprador premiou um fornecedor vencedor. Terminal.',
      },
      {
        type: 'rfq.request.cancelled',
        version: 1,
        description: 'A cotação foi encerrada sem vencedor, com razão. Terminal.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'rfq.request.manage',
  award: 'rfq.request.award',
} as const;

export const EVENTS = {
  registered: 'rfq.request.registered',
  opened: 'rfq.request.opened',
  awarded: 'rfq.request.awarded',
  cancelled: 'rfq.request.cancelled',
} as const;
