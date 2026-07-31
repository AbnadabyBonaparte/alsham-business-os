import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 43 — Fornecedores.
 *
 * `id` = `vendor` (o cinto de `emit_event` confere o prefixo `vendor.*`).
 * Domain `procurement` (Compras). `consumes` VAZIO (Lei 7).
 *
 * @see docs/canon/MODULO-VENDOR-SPEC.md
 * @see supabase/migrations/0058_vendor.sql
 */
export const MANIFEST = {
  id: 'vendor',
  name: 'Fornecedores',
  version: '0.1.0',
  summary:
    'O cadastro de fornecedores da empresa: nome e segmento em texto livre (vocabulário de cada compra), e o ciclo active ↔ archived — o fornecedor é relação comercial que volta (o DIVERGE do hr, onde o desligamento é terminal). Homologação formal e catálogo do fornecedor ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'procurement' },

  capabilities: [{ key: 'suppliers', canonicalName: 'Fornecedores' }],

  permissions: [
    {
      key: 'vendor.supplier.manage',
      moduleId: 'vendor',
      description: 'Cadastrar e editar fornecedores (nome e segmento em texto livre).',
    },
    {
      key: 'vendor.supplier.decide',
      moduleId: 'vendor',
      description: 'Arquivar ou reativar um fornecedor — a relação comercial que sai e volta.',
    },
  ],

  events: {
    emits: [
      {
        type: 'vendor.supplier.registered',
        version: 1,
        description: 'Um fornecedor nasceu no cadastro (sempre ativo).',
      },
      {
        type: 'vendor.supplier.updated',
        version: 1,
        description: 'Mudou o nome ou o segmento do fornecedor.',
      },
      {
        type: 'vendor.supplier.archived',
        version: 1,
        description: 'O fornecedor foi arquivado. Continua no banco; nunca DELETE.',
      },
      {
        type: 'vendor.supplier.reopened',
        version: 1,
        description: 'O fornecedor arquivado voltou ao cadastro vivo — a mesma relação.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'vendor.supplier.manage',
  decide: 'vendor.supplier.decide',
} as const;

export const EVENTS = {
  registered: 'vendor.supplier.registered',
  updated: 'vendor.supplier.updated',
  archived: 'vendor.supplier.archived',
  reopened: 'vendor.supplier.reopened',
} as const;
