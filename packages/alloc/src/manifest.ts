import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 56 — Recursos / Alocação.
 *
 * `id` = `alloc` (o cinto de `emit_event` confere o prefixo `alloc.*`).
 * Domain `pmo` (PMO & Projetos). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **A régua é PERCENTUAL, não horas** (horas seriam Timesheet, outra
 * capacidade). ⭐ **`active ↔ archived`** — a alocação que volta é a mesma linha
 * (a física do `vendor`/`dc`, o DIVERGE do `hr`). Projeto (proj) e colaborador
 * (hr) por id solto.
 *
 * @see docs/canon/MODULO-ALLOC-SPEC.md
 * @see supabase/migrations/0071_alloc.sql
 */
export const MANIFEST = {
  id: 'alloc',
  name: 'Recursos',
  version: '0.1.0',
  summary:
    'A alocação de recursos a projetos: o recurso em texto livre (pode ser terceiro/freelancer) e o quanto de sua capacidade vai ao projeto, em PERCENTUAL (não horas — horas seriam Timesheet, outra capacidade de PMO). O projeto e o colaborador entram por id solto. O ciclo é active ↔ archived — a alocação que volta é a mesma linha de planejamento (a física do vendor/dc, o DIVERGE do hr, onde o desligamento é terminal). Cálculo de disponibilidade entre projetos fica de fora.',

  taxonomy: { layer: 'domain', domain: 'pmo' },

  capabilities: [{ key: 'resources', canonicalName: 'Recursos' }],

  permissions: [
    {
      key: 'alloc.allocation.manage',
      moduleId: 'alloc',
      description: 'Cadastrar e editar alocações de recurso a projeto (percentual de capacidade).',
    },
    {
      key: 'alloc.allocation.decide',
      moduleId: 'alloc',
      description: 'Arquivar ou reativar uma alocação — a linha de planejamento que sai e volta.',
    },
  ],

  events: {
    emits: [
      {
        type: 'alloc.allocation.registered',
        version: 1,
        description: 'Uma alocação nasceu no plano (sempre ativa).',
      },
      {
        type: 'alloc.allocation.updated',
        version: 1,
        description: 'Mudou algum dado da alocação (recurso, projeto, percentual ou janela).',
      },
      {
        type: 'alloc.allocation.archived',
        version: 1,
        description: 'A alocação foi arquivada. Continua no banco; nunca DELETE.',
      },
      {
        type: 'alloc.allocation.reopened',
        version: 1,
        description: 'A alocação arquivada voltou ao plano vivo — a mesma linha.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'alloc.allocation.manage',
  decide: 'alloc.allocation.decide',
} as const;

export const EVENTS = {
  registered: 'alloc.allocation.registered',
  updated: 'alloc.allocation.updated',
  archived: 'alloc.allocation.archived',
  reopened: 'alloc.allocation.reopened',
} as const;
