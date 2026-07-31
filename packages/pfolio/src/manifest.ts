import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 62 — Portfólio de projetos.
 *
 * `id` = `pfolio` (o cinto de `emit_event` confere o prefixo `pfolio.*`).
 * Domain `pmo` (PMO & Projetos). `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ **A ÚLTIMA peça:** fecha o Domain PMO & Projetos em 10/10 capacidades.
 *
 * ⭐ **O ciclo `active ↔ archived`** (reaproveitado do `vendor`/`dc`): um
 * portfólio arquivado é o MESMO portfólio que volta — o DIVERGE dos fins
 * TERMINAIS do `proj`. ⭐ **Membros N:N:** o vínculo do membro ao portfólio é
 * INTRA-schema (peça do próprio módulo); o vínculo ao projeto é ID SOLTO
 * (cross-module). O MESMO projeto pode viver em VÁRIOS portfólios.
 *
 * @see docs/canon/MODULO-PFOLIO-SPEC.md
 * @see supabase/migrations/0077_pfolio.sql
 */
export const MANIFEST = {
  id: 'pfolio',
  name: 'Portfólio',
  version: '0.1.0',
  summary:
    'O agrupamento de projetos para leitura executiva: o portfólio com nome e descrição em texto livre, e os projetos que ele reúne por membros N:N (id solto ao projeto, nome carimbado pela tela). O ciclo é active ↔ archived — o portfólio é uma leitura que a empresa arquiva e reabre (o DIVERGE dos fins terminais do proj). O MESMO projeto pode estar em vários portfólios. Rollup automático de métricas e orçamento de portfólio ficam de fora (frente de BI de leitura; Lei 7).',

  taxonomy: { layer: 'domain', domain: 'pmo' },

  capabilities: [{ key: 'pfolio', canonicalName: 'Portfólio' }],

  permissions: [
    {
      key: 'pfolio.portfolio.manage',
      moduleId: 'pfolio',
      description: 'Criar e editar portfólios, arquivar e reabrir, e gerir os projetos que cada um reúne.',
    },
  ],

  events: {
    emits: [
      {
        type: 'pfolio.portfolio.registered',
        version: 1,
        description: 'Um portfólio nasceu (sempre ativo).',
      },
      {
        type: 'pfolio.portfolio.archived',
        version: 1,
        description: 'O portfólio foi arquivado. Continua no banco; nunca DELETE.',
      },
      {
        type: 'pfolio.portfolio.restored',
        version: 1,
        description: 'O portfólio arquivado voltou à leitura viva — o mesmo agrupamento.',
      },
      {
        type: 'pfolio.member.added',
        version: 1,
        description: 'Um projeto entrou no portfólio.',
      },
      {
        type: 'pfolio.member.removed',
        version: 1,
        description: 'Um projeto saiu do portfólio (o vínculo é mutável).',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'pfolio.portfolio.manage',
} as const;

export const EVENTS = {
  registered: 'pfolio.portfolio.registered',
  archived: 'pfolio.portfolio.archived',
  restored: 'pfolio.portfolio.restored',
  memberAdded: 'pfolio.member.added',
  memberRemoved: 'pfolio.member.removed',
} as const;
