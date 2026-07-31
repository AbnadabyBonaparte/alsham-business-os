import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 48 — Planejamento de Demanda.
 *
 * `id` = `dem` (o cinto de `emit_event` confere o prefixo `dem.*`).
 * Domain `supply-chain` (Supply Chain) — território SEPARADO de Compras
 * (Taxonomia §5). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **O DIVERGE do `rfq`.** A RFQ tem um segundo ato depois de enviar (o
 * comprador PREMIA — `open→awarded`). O plano de demanda NÃO: `published` é
 * TERMINAL. O próximo período é plano novo (a física do `bud`).
 *
 * @see docs/canon/MODULO-DEM-SPEC.md
 * @see supabase/migrations/0063_dem.sql
 */
export const MANIFEST = {
  id: 'dem',
  name: 'Planejamento de Demanda',
  version: '0.1.0',
  summary:
    'O plano de demanda por período (texto livre — "Q1 2027") e as linhas planejadas (produto e quantidade em texto livre). Nasce rascunho; PUBLICAR congela as linhas e é terminal — o próximo período é plano novo (a física do bud). O DIVERGE do rfq: não há segundo ato (nada de premiar). Previsão estatística (Engine de IA) e integração com vendas históricas ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'supply-chain' },

  capabilities: [{ key: 'demand-planning', canonicalName: 'Planejamento de demanda' }],

  permissions: [
    {
      key: 'dem.plan.manage',
      moduleId: 'dem',
      description: 'Criar e editar o plano em rascunho, incluir linhas, publicar e cancelar.',
    },
  ],

  events: {
    emits: [
      {
        type: 'dem.plan.registered',
        version: 1,
        description: 'Um plano de demanda nasceu (sempre em rascunho).',
      },
      {
        type: 'dem.plan.published',
        version: 1,
        description: 'O plano foi publicado à cadeia — as linhas congelaram. Terminal.',
      },
      {
        type: 'dem.plan.cancelled',
        version: 1,
        description: 'O rascunho do plano foi abandonado, com razão. Terminal.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'dem.plan.manage',
} as const;

export const EVENTS = {
  registered: 'dem.plan.registered',
  published: 'dem.plan.published',
  cancelled: 'dem.plan.cancelled',
} as const;
