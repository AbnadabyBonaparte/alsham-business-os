import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 6 — Compras (Pedidos).
 *
 * `id` = `po` porque o cinto de `emit_event` confere o prefixo `po.*`.
 * `consumes` VAZIO — protocolo paralelo; caminho pedido→AP declarado NÃO CONSTRUÍDO.
 *
 * @see docs/canon/MODULO-PO-SPEC.md
 * @see supabase/migrations/0017_po.sql
 */
export const MANIFEST = {
  id: 'po',
  name: 'Compras (Pedidos)',
  version: '0.1.0',
  summary:
    'Registra pedidos de compra com itens em texto livre, envia ao fornecedor e confere o recebimento — sem catálogo, sem cotação e sem inventar organograma.',

  taxonomy: { layer: 'domain', domain: 'procurement' },

  capabilities: [
    { key: 'purchase-orders', canonicalName: 'Pedidos' },
    { key: 'purchase-receipt', canonicalName: 'Recebimento' },
  ],

  permissions: [
    {
      key: 'po.order.manage',
      moduleId: 'po',
      description: 'Criar e editar rascunhos e enviar o pedido ao fornecedor.',
    },
    {
      key: 'po.order.cancel',
      moduleId: 'po',
      description: 'Cancelar um pedido — a ação destrutiva deste módulo.',
    },
    {
      key: 'po.order.receive',
      moduleId: 'po',
      description: 'Registrar quantidades recebidas. Comprador ≠ quem confere.',
    },
  ],

  events: {
    emits: [
      {
        type: 'po.order.registered',
        version: 1,
        description:
          'Um pedido nasceu (pode ser rascunho). Payload autossuficiente com itens.',
      },
      {
        type: 'po.order.updated',
        version: 1,
        description:
          'Mudou fato do pedido: status, totais, itens ou quantidades recebidas.',
      },
      {
        type: 'po.order.cancelled',
        version: 1,
        description: 'O pedido foi cancelado. Continua no banco; nunca DELETE.',
      },
    ],
    /** Lei 7: sem handler → sem promessa. Integração com AP = NÃO CONSTRUÍDO. */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  orderManage: 'po.order.manage',
  orderCancel: 'po.order.cancel',
  orderReceive: 'po.order.receive',
} as const;

export const EVENTS = {
  orderRegistered: 'po.order.registered',
  orderUpdated: 'po.order.updated',
  orderCancelled: 'po.order.cancelled',
} as const;
