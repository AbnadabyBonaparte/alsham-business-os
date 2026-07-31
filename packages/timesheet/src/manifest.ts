import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 61 — Apontamento de horas (Timesheet).
 *
 * `id` = `timesheet` (o cinto de `emit_event` confere o prefixo `timesheet.*`).
 * Domain `pmo` (PMO & Projetos). `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ A física é a do LANÇAMENTO IMUTÁVEL (o `pcost`/`recv`): o apontamento é
 * fato consumado — nasce e nunca muda; corrigir é lançar o ato inverso.
 * ⭐ O contraste com o `alloc`: o `alloc` é o PLANEJADO (percentual de
 * capacidade, mutável); o `timesheet` é o REALIZADO (horas trabalhadas,
 * imutável). O cálculo de custo/rate da hora é do `cash`/`pcost` genérico por
 * id solto — não nasce aqui.
 *
 * @see docs/canon/MODULO-TIMESHEET-SPEC.md
 * @see supabase/migrations/0076_timesheet.sql
 */
export const MANIFEST = {
  id: 'timesheet',
  name: 'Apontamento de horas',
  version: '0.1.0',
  summary:
    'O livro de horas trabalhadas da empresa: cada apontamento é um lançamento imutável — o projeto (id solto + nome), quem trabalhou (texto livre, mais um id solto opcional ao colaborador), o dia e as horas (sempre > 0). Registrar é fato consumado; corrigir é lançar o ato inverso, nunca reescrever. É o REALIZADO — a contraparte do alloc, que é o PLANEJADO (percentual de capacidade, mutável). Cálculo de custo/rate da hora, aprovação de folha de apontamento e capacidade/calendário ficam de fora (é o cash/pcost e capacidades futuras).',

  taxonomy: { layer: 'domain', domain: 'pmo' },

  capabilities: [{ key: 'timesheet', canonicalName: 'Timesheet' }],

  permissions: [
    {
      key: 'timesheet.entry.manage',
      moduleId: 'timesheet',
      description: 'Registrar um apontamento de horas — o projeto, quem trabalhou, o dia e as horas.',
    },
  ],

  events: {
    emits: [
      {
        type: 'timesheet.entry.registered',
        version: 1,
        description: 'Um apontamento de horas foi registrado. Lançamento imutável desde o instante 1.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'timesheet.entry.manage',
} as const;

export const EVENTS = {
  registered: 'timesheet.entry.registered',
} as const;
