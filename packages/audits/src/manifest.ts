import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 64 — Auditorias (de qualidade).
 *
 * `id` = `audit` (o cinto de `emit_event` confere o prefixo `audit.*`). Domain
 * `quality` (🧪 Qualidade). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **Ciclo `planned → completed`/`cancelled`, os dois fins TERMINAIS** (a física
 * do `proj`): auditoria encerrada não reabre. Tipo/escopo em TEXTO LIVRE. ⭐ **O
 * achado é IMUTÁVEL** com FK COMPOSTA INTRA-schema à auditoria (peça do próprio
 * módulo) e ID SOLTO opcional ao `nc` (Módulo 63) — um achado pode virar uma Não
 * Conformidade formal, ou não. ⚠️ NÃO é a *Auditoria* do Core nem a de GRC
 * (homônimos declarados — Sol Único).
 *
 * @see docs/canon/MODULO-AUDIT-SPEC.md
 * @see supabase/migrations/0079_audit.sql
 */
export const MANIFEST = {
  id: 'audit',
  name: 'Auditorias',
  version: '0.1.0',
  summary:
    'As auditorias de qualidade: a empresa planeja e conduz auditorias (internas, externas, de certificação) e registra os achados. O ciclo é planned → completed/cancelled, os dois fins terminais (a física do proj: auditoria encerrada não reabre — a próxima é auditoria nova); cancelar exige razão. Tipo e escopo são texto livre (dado do tenant, nunca enum). O achado é imutável, com FK intra-schema à auditoria e id solto ao nc (um achado pode virar uma Não Conformidade formal). NÃO é a Auditoria do Core nem a de GRC (homônimos declarados — Sol Único). consumes VAZIO.',

  taxonomy: { layer: 'domain', domain: 'quality' },

  capabilities: [{ key: 'audit', canonicalName: 'Auditorias' }],

  permissions: [
    {
      key: 'audit.audit.manage',
      moduleId: 'audit',
      description: 'Planejar auditorias, concluir e cancelar.',
    },
    {
      key: 'audit.finding.record',
      moduleId: 'audit',
      description: 'Registrar achados de auditoria.',
    },
  ],

  events: {
    emits: [
      {
        type: 'audit.audit.scheduled',
        version: 1,
        description: 'Uma auditoria foi planejada.',
      },
      {
        type: 'audit.audit.completed',
        version: 1,
        description: 'A auditoria foi concluída. Terminal.',
      },
      {
        type: 'audit.audit.cancelled',
        version: 1,
        description: 'A auditoria foi cancelada, com razão. Terminal.',
      },
      {
        type: 'audit.finding.recorded',
        version: 1,
        description: 'Um achado foi registrado — imutável; pode virar NC por id solto.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manageAudit: 'audit.audit.manage',
  recordFinding: 'audit.finding.record',
} as const;

export const EVENTS = {
  scheduled: 'audit.audit.scheduled',
  completed: 'audit.audit.completed',
  cancelled: 'audit.audit.cancelled',
  findingRecorded: 'audit.finding.recorded',
} as const;
