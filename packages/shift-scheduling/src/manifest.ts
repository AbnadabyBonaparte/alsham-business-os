import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Escalas.**
 *
 * ⚠️ **Por que o `id` é `shift`.** "schedule" colide com o vocabulário de
 * agenda genérica (o `edcal` já usa "agendamento"/planejamento); "shift" é
 * curto, greppável e é a palavra do próprio domínio (turno de trabalho) —
 * conferido por grep com fronteira de palavra: único no seed.
 *
 * @see docs/canon/MODULO-SHIFT-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0049_shift.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'shift',
  name: 'Escalas',
  version: '0.1.0',
  summary:
    'A escala de trabalho do tenant: turno TEXTO LIVRE, vínculo com o colaborador por id solto + nome carimbado. Duas escalas não ocupam o mesmo colaborador no mesmo período — o conflito é recusado pelo BANCO (exclusion constraint; a cancelada libera sozinha). O passado é permitido (fato consumado).',

  /**
   * ⭐ **Domain `hr` — Taxonomia §5, "👥 RH (14)"**. Cobre a capacidade
   * *Escalas*; as outras 13 do Domain seguem NÃO CONSTRUÍDAS ou construídas
   * por módulos irmãos desta onda (Admissão/Demissão no `hr`, Treinamentos
   * no `train`).
   */
  taxonomy: { layer: 'domain', domain: 'hr' },

  capabilities: [{ key: 'schedules', canonicalName: 'Escalas' }],

  /**
   * Duas permissões — escalar/remarcar é uma mão (manage); CANCELAR é
   * decisão à parte (decide), como desligar no `hr` e cancelar no `spc`.
   */
  permissions: [
    {
      key: 'shift.schedule.manage',
      moduleId: 'shift',
      description: 'Escalar colaboradores em turnos e períodos, e remarcar enquanto não rodou.',
    },
    {
      key: 'shift.schedule.decide',
      moduleId: 'shift',
      description: 'Cancelar uma escala — ato terminal, com razão escrita e carimbo do servidor.',
    },
  ],

  events: {
    emits: [
      {
        type: 'shift.schedule.scheduled',
        version: 1,
        description: 'Um turno foi escalado — colaborador (id solto + nome), turno e período no envelope.',
      },
      {
        type: 'shift.schedule.updated',
        version: 1,
        description: 'A escala foi remarcada no que é FATO: turno, período.',
      },
      {
        type: 'shift.schedule.cancelled',
        version: 1,
        description: 'A escala foi cancelada — terminal, com a razão. O período ficou livre sozinho.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler de Escalas existe
     * nesta onda. A integração escala→ponto (registrar o realizado a partir
     * do planejado) é futuro DECLARADO na spec §5, sem handler e sem
     * promessa — *Ponto* é capacidade própria do Domain RH, não construída.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'shift.schedule.manage',
  decide: 'shift.schedule.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  scheduled: 'shift.schedule.scheduled',
  updated: 'shift.schedule.updated',
  cancelled: 'shift.schedule.cancelled',
} as const;
