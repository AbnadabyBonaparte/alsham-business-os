import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 53 — Projetos.
 *
 * `id` = `proj` (o cinto de `emit_event` confere o prefixo `proj.*`).
 * Domain `pmo` (PMO & Projetos) — o MAIOR do mapa. `consumes` VAZIO (Lei 7).
 *
 * ⭐ **A física do encerramento é a do `bud`/`dem`:** `completed` e `cancelled`
 * são TERMINAIS — o projeto encerrado não reabre. E a assimetria: cancelar
 * exige razão; concluir tem nota opcional.
 *
 * @see docs/canon/MODULO-PROJ-SPEC.md
 * @see supabase/migrations/0068_proj.sql
 */
export const MANIFEST = {
  id: 'proj',
  name: 'Projetos',
  version: '0.1.0',
  summary:
    'O registro de projetos da empresa: nome e descrição em texto livre. O ciclo é planning → active → completed/cancelled, e os dois fins são terminais (a física do bud/dem — o projeto encerrado não reabre; o próximo é registro novo). Cancelar (abandonar) exige razão; concluir tem nota opcional. Orçamento consolidado (é o pcost) e aprovação formal de abertura ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'pmo' },

  capabilities: [{ key: 'projects', canonicalName: 'Projetos' }],

  permissions: [
    {
      key: 'proj.project.manage',
      moduleId: 'proj',
      description: 'Criar e editar projetos, iniciar, concluir e cancelar.',
    },
  ],

  events: {
    emits: [
      {
        type: 'proj.project.registered',
        version: 1,
        description: 'Um projeto nasceu (sempre em planejamento).',
      },
      {
        type: 'proj.project.activated',
        version: 1,
        description: 'O projeto entrou em andamento.',
      },
      {
        type: 'proj.project.completed',
        version: 1,
        description: 'O projeto foi concluído — com nota opcional. Terminal.',
      },
      {
        type: 'proj.project.cancelled',
        version: 1,
        description: 'O projeto foi abandonado, com razão. Terminal.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'proj.project.manage',
} as const;

export const EVENTS = {
  registered: 'proj.project.registered',
  activated: 'proj.project.activated',
  completed: 'proj.project.completed',
  cancelled: 'proj.project.cancelled',
} as const;
