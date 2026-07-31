import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 80 — Continuidade de Negócios.
 *
 * `id` = `continuity` (o cinto de `emit_event` confere o prefixo
 * `continuity.*`). Domain `infosec` (Segurança da Informação). `consumes`
 * VAZIO (Lei 7).
 *
 * ⭐ O RECORTE: o plano (nome, escopo, RTO/RPO texto livre; active ↔ archived) +
 * o LIVRO IMUTÁVEL de drills (a física do timesheet). O DOCUMENTO detalhado do
 * plano é o `pol` (documento versionado com ciência) e fica DECLARADO FORA.
 *
 * @see docs/canon/MODULO-CONTINUITY-SPEC.md
 * @see supabase/migrations/0095_continuity.sql
 */
export const MANIFEST = {
  id: 'continuity',
  name: 'Continuidade de Negócios',
  version: '0.1.0',
  summary:
    'O plano de continuidade da empresa (BCP/DRP): nome, escopo e os alvos RTO/RPO em texto livre, com o ciclo active ↔ archived (o plano descontinuado que a empresa retoma é o mesmo — a física do vendor). E o livro IMUTÁVEL de drills — cada teste do plano é um lançamento consumado (data, cenário, desfecho, nota — a física do timesheet), a prova de que o plano funciona. O documento detalhado do plano é o pol (documento versionado com ciência), declarado fora; failover automático e árvore de chamadas também ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'infosec' },

  capabilities: [{ key: 'business-continuity', canonicalName: 'Continuidade de negócios' }],

  permissions: [
    {
      key: 'continuity.plan.manage',
      moduleId: 'continuity',
      description: 'Cadastrar e editar planos de continuidade e registrar drills (data, cenário, desfecho).',
    },
    {
      key: 'continuity.plan.decide',
      moduleId: 'continuity',
      description: 'Arquivar ou reativar um plano de continuidade — o plano que sai e volta.',
    },
  ],

  events: {
    emits: [
      {
        type: 'continuity.plan.registered',
        version: 1,
        description: 'Um plano de continuidade nasceu no cadastro (sempre ativo).',
      },
      {
        type: 'continuity.plan.archived',
        version: 1,
        description: 'O plano foi arquivado. Continua no banco; nunca DELETE.',
      },
      {
        type: 'continuity.plan.reopened',
        version: 1,
        description: 'O plano arquivado voltou ao cadastro vivo — o mesmo plano.',
      },
      {
        type: 'continuity.drill.recorded',
        version: 1,
        description: 'Um drill do plano foi registrado. Lançamento imutável desde o instante 1.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'continuity.plan.manage',
  decide: 'continuity.plan.decide',
} as const;

export const EVENTS = {
  registered: 'continuity.plan.registered',
  archived: 'continuity.plan.archived',
  reopened: 'continuity.plan.reopened',
  recorded: 'continuity.drill.recorded',
} as const;
