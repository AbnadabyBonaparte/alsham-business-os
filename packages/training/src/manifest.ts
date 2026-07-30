import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Treinamentos.**
 *
 * ⚠️ **Por que o `id` é `train`, e não `training`.** Curto e greppável
 * (fronteira de palavra: zero colisões), na mesma lógica do `evt` —
 * "training" bate contra vocabulário comum demais em qualquer grep de
 * repositório; `train` é único.
 *
 * ⭐ **A identidade do `evt` (Módulo 11) reaproveitada para dentro de casa:**
 * turma publicada abre inscrição, a lotação recusa claro, a presença é ato
 * IMUTÁVEL carimbado pelo servidor. O DIVERGE assinado: a inscrição vai
 * ALÉM da presença — `attended → completed` é um fato que o evt nunca
 * precisou ter, porque comparecer a um evento não tem "aproveitamento".
 *
 * @see docs/canon/MODULO-TRAIN-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0050_train.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'train',
  name: 'Treinamentos',
  version: '0.1.0',
  summary:
    'Os programas de treinamento do tenant e as turmas deles: turma publicada abre inscrição; a presença é ato imutável carimbado pelo servidor (a física do evt); a conclusão por colaborador é ato registrado (data + nota opcional). Colaborador por id solto + nome. Sem certificado (Storage do Core, declarado FORA).',

  /**
   * ⭐ **Domain `hr` — Taxonomia §5, "👥 RH (14)"**. Cobre a capacidade
   * *Treinamentos*; as outras 13 do Domain seguem NÃO CONSTRUÍDAS por este
   * módulo (algumas construídas pelos módulos-irmãos da mesma onda: `hr`
   * cobre Admissão/Demissão, `shift` cobre Escalas, `perf` cobre Avaliação).
   */
  taxonomy: { layer: 'domain', domain: 'hr' },

  capabilities: [{ key: 'trainings', canonicalName: 'Treinamentos' }],

  /**
   * Duas permissões — desenhar o catálogo (setup) é uma mão; inscrever,
   * marcar presença e concluir é outra (enrollment), como o evt separa
   * `event.manage`/`event.decide` de `registration.manage`.
   */
  permissions: [
    {
      key: 'train.setup.manage',
      moduleId: 'train',
      description: 'Desenhar programas e turmas: publicar (abre inscrição), concluir e cancelar a turma.',
    },
    {
      key: 'train.enrollment.manage',
      moduleId: 'train',
      description: 'Inscrever colaboradores, registrar presença (ato imutável) e a conclusão do programa.',
    },
  ],

  events: {
    emits: [
      {
        type: 'train.session.published',
        version: 1,
        description: 'Uma turma abriu inscrição — programa, título e início no envelope.',
      },
      {
        type: 'train.session.concluded',
        version: 1,
        description: 'A turma foi concluída. Terminal.',
      },
      {
        type: 'train.session.cancelled',
        version: 1,
        description: 'A turma foi cancelada. Terminal.',
      },
      {
        type: 'train.enrollment.registered',
        version: 1,
        description: 'Um colaborador se inscreveu numa turma.',
      },
      {
        type: 'train.attendance.recorded',
        version: 1,
        description: 'A presença foi registrada — ato imutável, carimbado pelo servidor.',
      },
      {
        type: 'train.enrollment.completed',
        version: 1,
        description: 'O colaborador concluiu o programa — data e nota opcional.',
      },
      {
        type: 'train.enrollment.cancelled',
        version: 1,
        description: 'A inscrição foi cancelada. Terminal.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler de Treinamentos
     * existe nesta onda. Ver spec §5.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  setupManage: 'train.setup.manage',
  enrollmentManage: 'train.enrollment.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  sessionPublished: 'train.session.published',
  sessionConcluded: 'train.session.concluded',
  sessionCancelled: 'train.session.cancelled',
  enrollmentRegistered: 'train.enrollment.registered',
  attendanceRecorded: 'train.attendance.recorded',
  enrollmentCompleted: 'train.enrollment.completed',
  enrollmentCancelled: 'train.enrollment.cancelled',
} as const;
