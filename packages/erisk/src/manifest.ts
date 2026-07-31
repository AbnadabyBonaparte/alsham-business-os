import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 75 — Risco Corporativo.
 *
 * `id` = `erisk` (o cinto de `emit_event` confere o prefixo `erisk.*`).
 * Domain `grc` (Governança, Riscos & Compliance) — ABRE o Domain. `consumes`
 * VAZIO (Lei 7).
 *
 * ⭐⭐ **O DIVERGE do `risk` (Módulo 60, PMO):** este risco NÃO tem projeto — é o
 * risco ESTRATÉGICO do negócio, não o de entrega de um projeto. ⭐ **O MANTIDO:**
 * a régua 1–5, a severidade como leitura (a matriz de riscos) e a física do
 * ciclo (`mitigated` REABRE, `closed` é TERMINAL). ⭐ `treatment` traz os 4 T's
 * da ISO 31000 (accept/mitigate/transfer/avoid), que o `risk` não tem.
 *
 * @see docs/canon/MODULO-ERISK-SPEC.md
 * @see supabase/migrations/0090_erisk.sql
 */
export const MANIFEST = {
  id: 'erisk',
  name: 'Risco Corporativo',
  version: '0.1.0',
  summary:
    'O registro de riscos corporativos: o risco ESTRATÉGICO do negócio, com descrição em texto livre, dono, categoria, e a probabilidade e o impacto na régua 1–5 (física do método). O DIVERGE do risk (Módulo 60, PMO): NÃO tem projeto — o risk é o risco de entrega de um projeto, o erisk é o risco do negócio que vive enquanto a empresa vive. MANTIDO do risk: a régua 1–5, a severidade como leitura (a Matriz de riscos, probabilidade × impacto) e a física do ciclo — open → mitigated → closed, com mitigated que REABRE (mitigated → open, o mesmo risco) e closed TERMINAL. O treatment traz os 4 Ts da ISO 31000 (accept/mitigate/transfer/avoid). consumes VAZIO.',

  taxonomy: { layer: 'domain', domain: 'grc' },

  capabilities: [
    { key: 'enterprise-risk', canonicalName: 'Gestão de riscos' },
    { key: 'risk-matrix', canonicalName: 'Matriz de riscos' },
  ],

  permissions: [
    {
      key: 'erisk.entry.manage',
      moduleId: 'erisk',
      description: 'Registrar e editar riscos corporativos, definir tratamento, mitigar, reabrir e encerrar.',
    },
  ],

  events: {
    emits: [
      {
        type: 'erisk.entry.registered',
        version: 1,
        description: 'Um risco corporativo nasceu (sempre aberto).',
      },
      {
        type: 'erisk.entry.mitigated',
        version: 1,
        description: 'O risco passou a mitigado (a mitigação está em vigor).',
      },
      {
        type: 'erisk.entry.reopened',
        version: 1,
        description: 'O risco mitigado REABRIU — o mesmo risco voltou (a mitigação parou de funcionar).',
      },
      {
        type: 'erisk.entry.closed',
        version: 1,
        description: 'O risco foi encerrado. Terminal — o que recorre é risco novo.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'erisk.entry.manage',
} as const;

export const EVENTS = {
  registered: 'erisk.entry.registered',
  mitigated: 'erisk.entry.mitigated',
  reopened: 'erisk.entry.reopened',
  closed: 'erisk.entry.closed',
} as const;
