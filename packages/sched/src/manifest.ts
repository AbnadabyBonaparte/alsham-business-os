import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 54 — Cronogramas.
 *
 * `id` = `sched` (o cinto de `emit_event` confere o prefixo `sched.*`).
 * Domain `pmo` (PMO & Projetos). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **O DIVERGE do `dem`/`bud`:** o marco `done` REABRE (`done → planned`) — um
 * marco concluído por engano é correção de rota rotineira, não um período
 * contábil fechado. `cancelled` é TERMINAL.
 *
 * ⚠️ **O evento da conclusão é `sched.milestone.completed`, não `.done`:** o
 * outbox exige verbo no passado terminando em `ed`, e "done" não termina em
 * `ed`. O STATUS é `done`; o VERBO do fato é `completed`.
 *
 * @see docs/canon/MODULO-SCHED-SPEC.md
 * @see supabase/migrations/0069_sched.sql
 */
export const MANIFEST = {
  id: 'sched',
  name: 'Cronogramas',
  version: '0.1.0',
  summary:
    'Os marcos de um projeto: título em texto livre, data prevista opcional, vínculo ao projeto por id solto. O ciclo é planned → done/cancelled, com o REABRIR done → planned (a física do ops — o marco concluído por engano volta, o DIVERGE do dem/bud, cujo fim é terminal). cancelled é terminal; cancelar exige razão. Dependência entre marcos (Gantt) e avanço automático ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'pmo' },

  capabilities: [{ key: 'schedules', canonicalName: 'Cronogramas' }],

  permissions: [
    {
      key: 'sched.milestone.manage',
      moduleId: 'sched',
      description: 'Criar e editar marcos, concluir, reabrir e cancelar.',
    },
  ],

  events: {
    emits: [
      {
        type: 'sched.milestone.registered',
        version: 1,
        description: 'Um marco nasceu (sempre planejado).',
      },
      {
        type: 'sched.milestone.completed',
        version: 1,
        description: 'O marco foi concluído (status done). O verbo é completed — done não termina em -ed.',
      },
      {
        type: 'sched.milestone.reopened',
        version: 1,
        description: 'O marco concluído por engano foi reaberto (done → planned) — o DIVERGE do dem/bud.',
      },
      {
        type: 'sched.milestone.cancelled',
        version: 1,
        description: 'O marco foi abandonado, com razão. Terminal.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'sched.milestone.manage',
} as const;

export const EVENTS = {
  registered: 'sched.milestone.registered',
  completed: 'sched.milestone.completed',
  reopened: 'sched.milestone.reopened',
  cancelled: 'sched.milestone.cancelled',
} as const;
