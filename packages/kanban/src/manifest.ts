import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 55 — Kanban / Quadro de Tarefas do Projeto.
 *
 * `id` = `kanban` (o cinto de `emit_event` confere o prefixo `kanban.*`).
 * Domain `pmo` (PMO & Projetos). `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ **Reaproveita a física do `ops`** (etapas do tenant + itens que andam),
 * mas ESCOPADA a um projeto — o cartão carrega `project_id` obrigatório. Não é
 * "instalar o `ops` de novo": a física é a mesma, o território é o PMO (a lição
 * do `disp`/`recv`). O contraste `kanban × ops` é assinado no `lifecycle.test.ts`.
 *
 * @see docs/canon/MODULO-KANBAN-SPEC.md
 * @see supabase/migrations/0070_kanban.sql
 */
export const MANIFEST = {
  id: 'kanban',
  name: 'Kanban',
  version: '0.1.0',
  summary:
    'O quadro de tarefas de um projeto: colunas desenhadas pelo tenant (texto livre, ordenadas) e cartões que andam livremente entre elas por movimento simples. Reaproveita a física da Esteira de Produção (ops), mas ESCOPADA a um projeto — o cartão pertence a um projeto (id solto). Sem status de cartão e sem enum de coluna: "concluído" é uma coluna que o tenant desenha. WIP-limit, swimlane, cor, responsável e prazo ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'pmo' },

  capabilities: [{ key: 'kanban', canonicalName: 'Kanban' }],

  permissions: [
    {
      key: 'kanban.board.manage',
      moduleId: 'kanban',
      description: 'Criar e editar colunas, criar/editar cartões e mover cartões entre colunas.',
    },
  ],

  events: {
    emits: [
      {
        type: 'kanban.stage.registered',
        version: 1,
        description: 'Uma coluna do quadro nasceu.',
      },
      {
        type: 'kanban.card.registered',
        version: 1,
        description: 'Um cartão nasceu numa coluna.',
      },
      {
        type: 'kanban.card.moved',
        version: 1,
        description: 'Um cartão andou de uma coluna para outra.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'kanban.board.manage',
} as const;

export const EVENTS = {
  stageRegistered: 'kanban.stage.registered',
  cardRegistered: 'kanban.card.registered',
  cardMoved: 'kanban.card.moved',
} as const;
