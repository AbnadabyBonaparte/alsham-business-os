import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Agendamento.**
 *
 * ⚠️ **Por que o `id` é `booking`.** Curto, greppável, e neutro. ⭐ Módulo
 * VERTICAL da Beleza: `taxonomy.layer = 'vertical'`, `vertical = 'beauty'`.
 *
 * @see docs/canon/MODULO-BOOKING-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0112_booking.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'booking',
  name: 'Agendamento',
  version: '0.1.0',
  summary:
    'A agenda de serviços do salão: cliente (id solto ao crm — não paciente, não PHI), profissional (id solto ao módulo professional), serviço em TEXTO LIVRE (corte/coloração/limpeza de pele) e horário. ⭐ Reaproveita a física do no-show: scheduled → attended | no_show | cancelled, os três TERMINAIS (quem remarca abre outro). Marcar o desfecho é decisão carimbada pelo servidor; cancelar exige razão. consumes VAZIO.',

  /**
   * ⭐ Vertical `beauty` — Taxonomia §6, "💇 Beleza & Estética", capacidade
   * *Agendamento*.
   */
  taxonomy: { layer: 'vertical', vertical: 'beauty' },

  capabilities: [{ key: 'scheduling', canonicalName: 'Agendamento' }],

  /**
   * ⭐ Duas permissões, o par manage/decide reaproveitado do appointment:
   * `booking.manage` cria e remarca enquanto agendado; `booking.decide` marca o
   * desfecho (comparecer/faltar/cancelar) — decisão, carimbada pelo servidor.
   */
  permissions: [
    {
      key: 'booking.booking.manage',
      moduleId: 'booking',
      description: 'Criar um agendamento e remarcá-lo enquanto ainda está agendado.',
    },
    {
      key: 'booking.booking.decide',
      moduleId: 'booking',
      description: 'Marcar o desfecho do agendamento — comparecimento, falta (no-show) ou cancelamento.',
    },
  ],

  events: {
    emits: [
      {
        type: 'booking.booking.scheduled',
        version: 1,
        description: 'Um agendamento foi marcado — cliente, profissional e serviço por id solto/texto no envelope.',
      },
      {
        type: 'booking.booking.attended',
        version: 1,
        description: 'O cliente compareceu ao agendamento.',
      },
      {
        type: 'booking.booking.missed',
        version: 1,
        description: 'O cliente faltou (no-show) — a falta é dado, não silêncio.',
      },
      {
        type: 'booking.booking.cancelled',
        version: 1,
        description: 'O agendamento foi cancelado (com razão escrita).',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): cruzar com `crm.*`, `professional.*`
     * ou faturar comissão é integração futura, declarada FORA na spec §5 — sem
     * handler, sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  bookingManage: 'booking.booking.manage',
  bookingDecide: 'booking.booking.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  bookingScheduled: 'booking.booking.scheduled',
  bookingAttended: 'booking.booking.attended',
  bookingMissed: 'booking.booking.missed',
  bookingCancelled: 'booking.booking.cancelled',
} as const;
