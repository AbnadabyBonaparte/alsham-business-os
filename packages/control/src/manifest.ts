import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 76 — Controles Internos.
 *
 * `id` = `control` (o cinto de `emit_event` confere o prefixo `control.*`).
 * Domain `grc` (Governança, Riscos & Compliance). `consumes` VAZIO (Lei 7).
 *
 * ⭐ Duas físicas: o CONTROLE é cadastro (`active ↔ archived`, a física do
 * `vendor`); o TESTE é livro imutável (a física do `timesheet`). O tipo do
 * controle é CHECK argumentado (COSO). NÃO é `pol`, NÃO é `audit`, NÃO é `erisk`.
 *
 * @see docs/canon/MODULO-CONTROL-SPEC.md
 * @see supabase/migrations/0091_control.sql
 */
export const MANIFEST = {
  id: 'control',
  name: 'Controles Internos',
  version: '0.1.0',
  summary:
    'O cadastro dos controles internos da empresa: a rotina de verificação que se desenha para se proteger, com nome, dono e frequência em texto livre e o tipo na régua preventive/detective/corrective (física do COSO, CHECK). O ciclo é active ↔ archived — o controle descontinuado volta (a física do vendor). Cada teste do controle é um FATO CONSUMADO (data, resultado pass/fail, nota) num livro IMUTÁVEL (a física do timesheet): corrigir é registrar outro teste, nunca reescrever. Vínculo opcional ao risco por id solto. Não é a política versionada (pol), não é a auditoria com achados (audit), não é o risco em si (erisk).',

  taxonomy: { layer: 'domain', domain: 'grc' },

  capabilities: [{ key: 'internal-controls', canonicalName: 'Controles internos' }],

  permissions: [
    {
      key: 'control.control.manage',
      moduleId: 'control',
      description: 'Cadastrar e editar controles internos, e registrar testes no livro imutável.',
    },
    {
      key: 'control.control.decide',
      moduleId: 'control',
      description: 'Arquivar ou reativar um controle — a rotina de verificação que sai e volta.',
    },
  ],

  events: {
    emits: [
      {
        type: 'control.control.registered',
        version: 1,
        description: 'Um controle interno nasceu no cadastro (sempre ativo).',
      },
      {
        type: 'control.control.archived',
        version: 1,
        description: 'O controle foi arquivado. Continua no banco; nunca DELETE.',
      },
      {
        type: 'control.control.reopened',
        version: 1,
        description: 'O controle arquivado voltou ao cadastro vivo — a mesma rotina.',
      },
      {
        type: 'control.test.recorded',
        version: 1,
        description: 'Um teste do controle foi registrado no livro imutável (data, resultado pass/fail).',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'control.control.manage',
  decide: 'control.control.decide',
} as const;

export const EVENTS = {
  registered: 'control.control.registered',
  archived: 'control.control.archived',
  reopened: 'control.control.reopened',
  recorded: 'control.test.recorded',
} as const;
