import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 59 — Gantt / Dependências entre marcos.
 *
 * `id` = `gantt` (o cinto de `emit_event` confere o prefixo `gantt.*`).
 * Domain `pmo` (PMO & Projetos). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **O que este módulo É:** o grafo de precedência entre marcos — a ARESTA
 * predecessor → sucessor. O marco em si é do `sched` (id solto, jamais lido). O
 * dado genuinamente novo é a aresta.
 *
 * ⭐ **Registro MUTÁVEL** (a aresta some quando o plano muda) — o DIVERGE dos
 * livros imutáveis (recv/pcost). Por isso emite tanto `registered` quanto
 * `removed`. Sem caminho crítico, sem cálculo de datas, sem motor de agenda.
 *
 * @see docs/canon/MODULO-GANTT-SPEC.md
 * @see supabase/migrations/0074_gantt.sql
 */
export const MANIFEST = {
  id: 'gantt',
  name: 'Gantt',
  version: '0.1.0',
  summary:
    'O grafo de dependências entre marcos do projeto: a aresta predecessor → sucessor, com o tipo entre as quatro relações clássicas de precedência (finish_to_start é o default). O marco entra por id solto ao sched — este módulo NÃO o reconstrói nem o lê. É um registro MUTÁVEL: a dependência é metadado do plano e some quando o plano muda (o DIVERGE dos livros imutáveis). Sem caminho crítico, sem cálculo de datas e sem motor de agenda — isso é vista de tela e frente futura, nunca dado novo aqui.',

  taxonomy: { layer: 'domain', domain: 'pmo' },

  capabilities: [{ key: 'gantt', canonicalName: 'Gantt' }],

  permissions: [
    {
      key: 'gantt.dependency.manage',
      moduleId: 'gantt',
      description: 'Registrar e remover dependências entre marcos.',
    },
  ],

  events: {
    emits: [
      {
        type: 'gantt.dependency.registered',
        version: 1,
        description: 'Uma aresta de precedência entre dois marcos nasceu.',
      },
      {
        type: 'gantt.dependency.removed',
        version: 1,
        description: 'Uma aresta de precedência foi removida (o plano mudou).',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'gantt.dependency.manage',
} as const;

export const EVENTS = {
  registered: 'gantt.dependency.registered',
  removed: 'gantt.dependency.removed',
} as const;
