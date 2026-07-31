import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 78 — Gestão de Vulnerabilidades.
 *
 * `id` = `vuln` (o cinto de `emit_event` confere o prefixo `vuln.*`).
 * Domain `infosec` (Segurança da Informação). `consumes` VAZIO (Lei 7).
 *
 * ⭐ **O RECORTE:** a vulnerabilidade DOS SISTEMAS DO TENANT (IAM/Cofre/SIEM/
 * Backup são a plataforma cuidando da própria infra e ficam FORA).
 *
 * ⭐ **A identidade é a do `nc`/`capa`** (fato constatado + remediação). ⭐⭐ **O
 * DIVERGE:** a severidade 1–5 é CHECK argumentado, e há DUAS respostas
 * terminais — `remediated` (corrigi-a) e `accepted_risk` (aceitei o risco), as
 * duas com justificativa. `in_progress` volta a `open` (reavaliar). Vínculo ao
 * `secincident` por id solto.
 *
 * @see docs/canon/MODULO-VULN-SPEC.md
 * @see supabase/migrations/0093_vuln.sql
 */
export const MANIFEST = {
  id: 'vuln',
  name: 'Gestão de Vulnerabilidades',
  version: '0.1.0',
  summary:
    'O registro da vulnerabilidade constatada nos SISTEMAS DO TENANT (IAM/Cofre/SIEM/Backup da plataforma ficam FORA) — a identidade do nc/capa: título e descrição obrigatórios, sistema afetado e plano de remediação em texto livre, severidade 1–5 (CHECK argumentado, a física do método). O ciclo é open → in_progress → remediated/accepted_risk, com in_progress voltando a open (reavaliar). São DUAS respostas TERMINAIS, cada uma com a justificativa escrita: remediated (corrigi-a) e accepted_risk (decidi conviver com o risco). A que reaparece é registro novo. O vínculo ao incidente de segurança é por id solto. consumes VAZIO.',

  taxonomy: { layer: 'domain', domain: 'infosec' },

  capabilities: [{ key: 'vulnerability-management', canonicalName: 'Gestão de vulnerabilidades' }],

  permissions: [
    {
      key: 'vuln.finding.manage',
      moduleId: 'vuln',
      description:
        'Registrar e tratar vulnerabilidades — avançar para em progresso, reavaliar, remediar ou aceitar o risco.',
    },
  ],

  events: {
    emits: [
      {
        type: 'vuln.finding.registered',
        version: 1,
        description: 'Uma vulnerabilidade foi registrada — o desvio constatado num sistema do tenant (sempre aberta).',
      },
      {
        type: 'vuln.finding.progressed',
        version: 1,
        description: 'A vulnerabilidade passou a em progresso — a remediação começou.',
      },
      {
        type: 'vuln.finding.remediated',
        version: 1,
        description: 'A vulnerabilidade foi remediada, com a nota de remediação. Terminal — a que reaparece é registro novo.',
      },
      {
        type: 'vuln.finding.accepted',
        version: 1,
        description: 'O risco da vulnerabilidade foi aceito, com a justificativa. Terminal — a segunda resposta.',
      },
      {
        type: 'vuln.finding.reopened',
        version: 1,
        description: 'A vulnerabilidade em progresso voltou a aberta — reavaliada (o carimbo de encerramento nunca chegou).',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'vuln.finding.manage',
} as const;

export const EVENTS = {
  registered: 'vuln.finding.registered',
  progressed: 'vuln.finding.progressed',
  remediated: 'vuln.finding.remediated',
  accepted: 'vuln.finding.accepted',
  reopened: 'vuln.finding.reopened',
} as const;
