import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 66 — Requisitos ISO.
 *
 * `id` = `iso` (o cinto de `emit_event` confere o prefixo `iso.*`).
 * Domain `quality` (Qualidade). `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ **A conformidade é MUTÁVEL, não um ciclo:** `compliant` × `non_compliant`
 * × `not_applicable` é uma avaliação que muda a cada auditoria — o DIVERGE
 * assinado de todos os módulos com ciclo de vida terminal. ⭐ **`active ↔
 * archived`** (a física do `vendor`/`dc`/`pfolio`): a cláusula fora de escopo é
 * arquivada e VOLTA. ⭐ **A norma é TEXTO LIVRE** (dado do tenant, jamais lista
 * fechada).
 *
 * @see docs/canon/MODULO-ISO-SPEC.md
 * @see supabase/migrations/0081_iso.sql
 */
export const MANIFEST = {
  id: 'iso',
  name: 'Requisitos ISO',
  version: '0.1.0',
  summary:
    'Os requisitos de norma que a empresa precisa cumprir: a referência da cláusula (texto livre, dado do tenant) e a conformidade — compliant/non_compliant/not_applicable. A conformidade é MUTÁVEL: uma avaliação que muda a cada auditoria, NÃO um ciclo de vida terminal (o DIVERGE assinado dos módulos com fim terminal). O ciclo de arquivamento é active ↔ archived, reversível, para cláusulas que saem de escopo — outro conceito, distinto da conformidade. consumes VAZIO. Anexo de evidência (Storage do Core) e vínculo automático com audit/nc ficam de fora (cruzar na tela; Lei 7).',

  taxonomy: { layer: 'domain', domain: 'quality' },

  capabilities: [{ key: 'iso', canonicalName: 'ISO' }],

  permissions: [
    {
      key: 'iso.requirement.manage',
      moduleId: 'iso',
      description: 'Registrar requisitos de norma, reavaliar a conformidade e arquivar/reabrir cláusulas.',
    },
  ],

  events: {
    emits: [
      {
        type: 'iso.requirement.registered',
        version: 1,
        description: 'Um requisito de norma foi registrado.',
      },
      {
        type: 'iso.requirement.assessed',
        version: 1,
        description: 'A conformidade de um requisito foi reavaliada.',
      },
      {
        type: 'iso.requirement.archived',
        version: 1,
        description: 'A cláusula saiu de escopo (arquivada). Volta se voltar ao escopo.',
      },
      {
        type: 'iso.requirement.restored',
        version: 1,
        description: 'A cláusula arquivada voltou ao escopo.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'iso.requirement.manage',
} as const;

export const EVENTS = {
  registered: 'iso.requirement.registered',
  assessed: 'iso.requirement.assessed',
  archived: 'iso.requirement.archived',
  restored: 'iso.requirement.restored',
} as const;
