import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 50 — Centros de Distribuição.
 *
 * `id` = `dc` (o cinto de `emit_event` confere o prefixo `dc.*`).
 * Domain `supply-chain` (Supply Chain) — território SEPARADO de Compras
 * (Taxonomia §5). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **`active ↔ archived` — o DIVERGE do `hr`.** O CD é ativo que volta a
 * operar; o desligamento do `hr` é terminal.
 *
 * @see docs/canon/MODULO-DC-SPEC.md
 * @see supabase/migrations/0065_dc.sql
 */
export const MANIFEST = {
  id: 'dc',
  name: 'Centros de Distribuição',
  version: '0.1.0',
  summary:
    'O cadastro de centros de distribuição da empresa: nome e endereço em texto livre (o lugar de cada CD), e o ciclo active ↔ archived — o CD é ativo que volta a operar (o DIVERGE do hr, onde o desligamento é terminal). Capacidade volumétrica estruturada e zoneamento interno ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'supply-chain' },

  capabilities: [{ key: 'distribution-centers', canonicalName: 'Centros de distribuição' }],

  permissions: [
    {
      key: 'dc.center.manage',
      moduleId: 'dc',
      description: 'Cadastrar e editar centros de distribuição (nome e endereço em texto livre).',
    },
    {
      key: 'dc.center.decide',
      moduleId: 'dc',
      description: 'Arquivar ou reativar um centro de distribuição — o ativo que sai e volta a operar.',
    },
  ],

  events: {
    emits: [
      {
        type: 'dc.center.registered',
        version: 1,
        description: 'Um centro de distribuição nasceu no cadastro (sempre ativo).',
      },
      {
        type: 'dc.center.updated',
        version: 1,
        description: 'Mudou o nome ou o endereço do centro de distribuição.',
      },
      {
        type: 'dc.center.archived',
        version: 1,
        description: 'O centro de distribuição foi arquivado. Continua no banco; nunca DELETE.',
      },
      {
        type: 'dc.center.reopened',
        version: 1,
        description: 'O centro arquivado voltou ao cadastro vivo — o mesmo ativo.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'dc.center.manage',
  decide: 'dc.center.decide',
} as const;

export const EVENTS = {
  registered: 'dc.center.registered',
  updated: 'dc.center.updated',
  archived: 'dc.center.archived',
  reopened: 'dc.center.reopened',
} as const;
