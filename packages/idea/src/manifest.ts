import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 68 — Ideias & Pipeline de Inovação.
 *
 * `id` = `idea` (o cinto de `emit_event` confere o prefixo `idea.*`).
 * Domain `rnd` (Pesquisa & Desenvolvimento — território novo). `consumes` VAZIO.
 *
 * ⭐⭐ DUAS capacidades, um módulo: *Ideias* e *Pipeline de inovação* são a
 * mesma coisa — uma ideia que anda por um funil.
 *
 * ⭐⭐ O DIVERGE do `kanban`: a ideia NÃO tem `project_id` obrigatório — ela
 * existe ANTES de qualquer projeto. O único elo é o `promoted_project_id` (id
 * solto) do DESTINO, quando a ideia é promovida a projeto. Ciclo: active →
 * promoted (terminal) / archived (reversível).
 *
 * @see docs/canon/MODULO-IDEA-SPEC.md
 * @see supabase/migrations/0083_idea.sql
 */
export const MANIFEST = {
  id: 'idea',
  name: 'Ideias & Pipeline de Inovação',
  version: '0.1.0',
  summary:
    'O funil de inovação da empresa: as etapas do pipeline (desenho do tenant, texto livre e ordenadas) e as ideias que caminham por elas. A ideia NÃO tem project_id (o DIVERGE do kanban): ela nasce antes de qualquer projeto; o único elo é o promoted_project_id (id solto) do destino, quando é promovida. O ciclo é active → promoted (terminal — virou projeto) / archived (reversível — a gaveta que volta). Mover de etapa é UPDATE simples, sem aprovação (a liberdade do kanban). Score/votação, autor e gate de aprovação ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'rnd' },

  capabilities: [
    { key: 'ideas', canonicalName: 'Ideias' },
    { key: 'innovation-pipeline', canonicalName: 'Pipeline de inovação' },
  ],

  permissions: [
    {
      key: 'idea.idea.manage',
      moduleId: 'idea',
      description: 'Desenhar as etapas do funil, registrar ideias, movê-las de etapa, promover e arquivar.',
    },
  ],

  events: {
    emits: [
      { type: 'idea.stage.registered', version: 1, description: 'Uma etapa do funil foi criada.' },
      { type: 'idea.idea.registered', version: 1, description: 'Uma ideia foi registrada (sempre ativa).' },
      { type: 'idea.idea.moved', version: 1, description: 'A ideia andou de etapa no funil.' },
      { type: 'idea.idea.promoted', version: 1, description: 'A ideia virou projeto (terminal).' },
      { type: 'idea.idea.archived', version: 1, description: 'A ideia foi descartada (reversível).' },
      { type: 'idea.idea.restored', version: 1, description: 'A ideia arquivada voltou ao funil.' },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'idea.idea.manage',
} as const;

export const EVENTS = {
  stageRegistered: 'idea.stage.registered',
  registered: 'idea.idea.registered',
  moved: 'idea.idea.moved',
  promoted: 'idea.idea.promoted',
  archived: 'idea.idea.archived',
  restored: 'idea.idea.restored',
} as const;
