import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Cadastro de Colaboradores.**
 *
 * ⚠️ **Por que o `id` é `hr`.** É o nome do Domain (Taxonomia §5, "👥 RH"),
 * curto e greppável (fronteira de palavra: zero colisões com a frota da
 * campanha). O primeiro módulo do BLOCO DE PESSOAS ocupa o nome do bloco,
 * como o `ops` fez com Operações.
 *
 * @see docs/canon/MODULO-HR-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0048_hr.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'hr',
  name: 'Cadastro de Colaboradores',
  version: '0.1.0',
  summary:
    'Quem trabalha na empresa: cargo e departamento TEXTO LIVRE (nunca enum). O afastamento (on_leave) volta; o desligamento (terminated) é TERMINAL e exige razão escrita — quem retorna é admissão nova, com vínculo solto ao registro anterior. Sem dado sensível.',

  /**
   * ⭐ **Domain `hr` — Taxonomia §5, "👥 RH (14)"**. Cobre as capacidades
   * *Admissão* e *Demissão*; as outras 12 do Domain (Folha, Benefícios,
   * Recrutamento, Ponto, Férias, OKRs, Plano de carreira…) seguem NÃO
   * CONSTRUÍDAS — Folha e Benefícios exigem dado sensível e ficam FORA
   * por decisão (spec §5).
   */
  taxonomy: { layer: 'domain', domain: 'hr' },

  capabilities: [
    { key: 'admission', canonicalName: 'Admissão' },
    { key: 'termination', canonicalName: 'Demissão' },
  ],

  /**
   * Duas permissões — cadastrar e afastar é uma mão (manage); DESLIGAR é
   * decisão à parte (decide), como publicar/realizar no evt.
   */
  permissions: [
    {
      key: 'hr.employee.manage',
      moduleId: 'hr',
      description: 'Cadastrar colaboradores, editar dados e afastar/reintegrar (on_leave ↔ active).',
    },
    {
      key: 'hr.employee.decide',
      moduleId: 'hr',
      description: 'Desligar um colaborador — ato terminal, com razão escrita e carimbo do servidor.',
    },
  ],

  events: {
    emits: [
      {
        type: 'hr.employee.hired',
        version: 1,
        description: 'Um colaborador foi admitido — nome (dado neutro), cargo e data no envelope.',
      },
      {
        type: 'hr.employee.updated',
        version: 1,
        description: 'Os dados do colaborador mudaram (nome, cargo, departamento, admissão).',
      },
      {
        type: 'hr.employee.suspended',
        version: 1,
        description: 'O colaborador foi afastado (on_leave) — reversível.',
      },
      {
        type: 'hr.employee.reinstated',
        version: 1,
        description: 'O colaborador afastado voltou (active).',
      },
      {
        type: 'hr.employee.terminated',
        version: 1,
        description: 'O colaborador foi desligado — terminal, com a razão escrita.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler de RH existe nesta
     * onda. Integrações (folha por evento, provisionamento de acesso) são
     * futuro DECLARADO na spec §5, sem handler e sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'hr.employee.manage',
  decide: 'hr.employee.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  hired: 'hr.employee.hired',
  updated: 'hr.employee.updated',
  suspended: 'hr.employee.suspended',
  reinstated: 'hr.employee.reinstated',
  terminated: 'hr.employee.terminated',
} as const;
