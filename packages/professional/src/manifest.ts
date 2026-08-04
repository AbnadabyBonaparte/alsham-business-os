import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Profissionais.**
 *
 * ⚠️ **Por que o `id` é `professional`.** Curto, greppável e neutro — o nome do
 * ofício, não da casa. ⭐ Módulo VERTICAL da Beleza: `taxonomy.layer =
 * 'vertical'`, `vertical = 'beauty'`.
 *
 * @see docs/canon/MODULO-PROFESSIONAL-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0113_professional.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'professional',
  name: 'Profissionais',
  version: '0.1.0',
  summary:
    'O roster de profissionais do salão (cabeleireiro, manicure, esteticista): nome (neutro) e especialidade em TEXTO LIVRE (dado do tenant, nunca enum). ⭐ active ↔ archived — o profissional que sai e volta é a MESMA pessoa (a física do vendor/mall, o DIVERGE do hr terminal). hr_employee_id é id solto OPCIONAL: quando o profissional também é colaborador do hr — mas o cadeira-alugada autônomo não é empregado, e por isso este roster é próprio, não o hr.',

  /**
   * ⭐ Vertical `beauty` — Taxonomia §6, "💇 Beleza & Estética", capacidade
   * *Profissionais*.
   */
  taxonomy: { layer: 'vertical', vertical: 'beauty' },

  capabilities: [{ key: 'professionals', canonicalName: 'Profissionais' }],

  /**
   * ⭐ UMA permissão só. `professional.manage` cobre registrar, editar,
   * arquivar E reativar — o roster do salão não tem o par manage/decide do
   * mall/vendor: cadastrar o profissional e movê-lo no arquivo são o mesmo
   * ofício de recepção.
   */
  permissions: [
    {
      key: 'professional.professional.manage',
      moduleId: 'professional',
      description:
        'Registrar o profissional (nome, especialidade e vínculo opcional ao hr por id solto), editá-lo e arquivá-lo ou reativá-lo.',
    },
  ],

  events: {
    emits: [
      {
        type: 'professional.professional.registered',
        version: 1,
        description: 'Um profissional entrou no roster — nome, especialidade e vínculo opcional ao hr por id solto.',
      },
      {
        type: 'professional.professional.archived',
        version: 1,
        description: 'O profissional foi arquivado (saiu do roster vivo; reversível).',
      },
      {
        type: 'professional.professional.reactivated',
        version: 1,
        description: 'O profissional arquivado voltou ao roster — a MESMA pessoa.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): cruzar com `hr.employee.*` seria
     * integração futura, e o `hr_employee_id` é ID SOLTO — sem handler, sem
     * promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  professionalManage: 'professional.professional.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  professionalRegistered: 'professional.professional.registered',
  professionalArchived: 'professional.professional.archived',
  professionalReactivated: 'professional.professional.reactivated',
} as const;
