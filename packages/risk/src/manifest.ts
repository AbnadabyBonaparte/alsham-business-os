import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 60 — Riscos do projeto.
 *
 * `id` = `risk` (o cinto de `emit_event` confere o prefixo `risk.*`).
 * Domain `pmo` (PMO & Projetos). `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ **A física nova:** `mitigated` REABRE (`mitigated → open`), `closed` é
 * TERMINAL. ⭐ A régua 1–5 (probabilidade/impacto) é CHECK argumentado no banco.
 * Vínculo ao projeto por ID SOLTO (o `proj` não é lido).
 *
 * @see docs/canon/MODULO-RISK-SPEC.md
 * @see supabase/migrations/0075_risk.sql
 */
export const MANIFEST = {
  id: 'risk',
  name: 'Riscos',
  version: '0.1.0',
  summary:
    'O registro de riscos do projeto: a descrição em texto livre, a probabilidade e o impacto na régua 1–5 (física do método), o plano de mitigação e o vínculo ao projeto por id solto. O ciclo é open → mitigated → closed, com a física NOVA de que mitigated REABRE (mitigated → open, o mesmo risco volta) enquanto closed é TERMINAL (o risco que passou está encerrado; o que recorre é registro novo). A severidade (probabilidade × impacto) é leitura, nunca decisão.',

  taxonomy: { layer: 'domain', domain: 'pmo' },

  capabilities: [{ key: 'risk', canonicalName: 'Riscos' }],

  permissions: [
    {
      key: 'risk.entry.manage',
      moduleId: 'risk',
      description: 'Registrar e editar riscos, mitigar, reabrir e encerrar.',
    },
  ],

  events: {
    emits: [
      {
        type: 'risk.entry.registered',
        version: 1,
        description: 'Um risco nasceu (sempre aberto).',
      },
      {
        type: 'risk.entry.mitigated',
        version: 1,
        description: 'O risco passou a mitigado (a mitigação está em vigor).',
      },
      {
        type: 'risk.entry.reopened',
        version: 1,
        description: 'O risco mitigado REABRIU — o mesmo risco voltou (a mitigação parou de funcionar).',
      },
      {
        type: 'risk.entry.closed',
        version: 1,
        description: 'O risco foi encerrado. Terminal — o que recorre é risco novo.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'risk.entry.manage',
} as const;

export const EVENTS = {
  registered: 'risk.entry.registered',
  mitigated: 'risk.entry.mitigated',
  reopened: 'risk.entry.reopened',
  closed: 'risk.entry.closed',
} as const;
