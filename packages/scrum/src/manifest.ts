import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 58 — Scrum / Sprints.
 *
 * `id` = `scrum` (o cinto de `emit_event` confere o prefixo `scrum.*`).
 * Domain `pmo` (PMO & Projetos). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **O que NÃO reconstrói:** os itens de trabalho do sprint são os cartões do
 * `kanban`. Este módulo é só a MOLDURA TEMPORAL (time-box). ⭐ UM sprint ativo
 * por projeto (constraint do banco). `closed` é TERMINAL.
 *
 * @see docs/canon/MODULO-SCRUM-SPEC.md
 * @see supabase/migrations/0073_scrum.sql
 */
export const MANIFEST = {
  id: 'scrum',
  name: 'Scrum',
  version: '0.1.0',
  summary:
    'A moldura temporal (time-box) do projeto: o sprint com nome e objetivo em texto livre, janela de datas, e o vínculo ao projeto por id solto. UM projeto tem no máximo UM sprint ativo por vez (regra na constraint do banco). closed é terminal (a física do bud/proj). Os itens de trabalho são os cartões do kanban — este módulo NÃO os reconstrói; a composição é de tela, não de schema.',

  taxonomy: { layer: 'domain', domain: 'pmo' },

  capabilities: [{ key: 'scrum', canonicalName: 'Scrum' }],

  permissions: [
    {
      key: 'scrum.sprint.manage',
      moduleId: 'scrum',
      description: 'Criar e editar sprints, ativar e encerrar.',
    },
  ],

  events: {
    emits: [
      {
        type: 'scrum.sprint.registered',
        version: 1,
        description: 'Um sprint nasceu (sempre planejado).',
      },
      {
        type: 'scrum.sprint.activated',
        version: 1,
        description: 'O sprint entrou em andamento (o único ativo do projeto).',
      },
      {
        type: 'scrum.sprint.closed',
        version: 1,
        description: 'O sprint foi encerrado. Terminal — o próximo é sprint novo.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'scrum.sprint.manage',
} as const;

export const EVENTS = {
  registered: 'scrum.sprint.registered',
  activated: 'scrum.sprint.activated',
  closed: 'scrum.sprint.closed',
} as const;
