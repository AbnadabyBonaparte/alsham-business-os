import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Credenciamento & Check-in.**
 *
 * ⭐⭐ **UM SCHEMA, DUAS CAPACIDADES.** É a física do `train` (Módulo 35)
 * re-perguntada para o portão de um evento: lá o par é inscrição → presença;
 * aqui é CREDENCIAL → CHECK-IN. A credencial é o cadastro revogável
 * (`active ↔ revoked`); o check-in é o ato pontual imutável, carimbado pelo
 * servidor (a física do `vis`).
 *
 * ⭐ **O DIVERGE assinado do `train`:** a inscrição do train vai além da
 * presença (`attended → completed`); o check-in NÃO — é o evento de presença
 * do `vis`, um fato sem sequência. Quem volta amanhã faz OUTRO check-in.
 *
 * @see docs/canon/MODULO-ACCRED-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0109_accred.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'accred',
  name: 'Credenciamento & Check-in',
  version: '0.1.0',
  summary:
    'As credenciais de acesso de um evento (id solto ao evt; portador, tipo e nível de acesso em texto livre; active ↔ revoked, a credencial volta do bloqueio) e o check-in — a chegada validada no portão contra a credencial ativa, ato pontual imutável carimbado pelo servidor (a física do vis/train). Sem ingresso/pagamento (Lei 3) e sem check-out nesta onda.',

  /**
   * Vertical `events` — Taxonomia §6, "🎪 Eventos", capacidades
   * *Credenciamento* e *Check-in*. A chave é a `VerticalKey` do `@alsham/core`.
   * O evento universal (a feira, o workshop) é o `evt` genérico; o
   * credenciamento é ofício do vertical, e o `evt` DE PROPÓSITO o rejeita no
   * schema dele.
   */
  taxonomy: { layer: 'vertical', vertical: 'events' },

  /** ⭐ DUAS capacidades da Taxonomia num módulo só. */
  capabilities: [
    { key: 'accreditation', canonicalName: 'Credenciamento' },
    { key: 'checkin', canonicalName: 'Check-in' },
  ],

  /**
   * Duas permissões, física deliberadamente ASSIMÉTRICA: quem EMITE e REVOGA
   * a credencial (`credential.manage`) não precisa ser quem opera o PORTÃO
   * (`checkin.record`) — no dia do evento, o staff da entrada registra
   * chegadas; ele não está emitindo nem bloqueando crachá.
   */
  permissions: [
    {
      key: 'accred.credential.manage',
      moduleId: 'accred',
      description: 'Emitir, editar e revogar/reativar credenciais de um evento (texto livre; voltam do bloqueio).',
    },
    {
      key: 'accred.checkin.record',
      moduleId: 'accred',
      description: 'Registrar a chegada no portão contra a credencial ativa — ato imutável, carimbado pelo servidor.',
    },
  ],

  events: {
    emits: [
      {
        type: 'accred.credential.registered',
        version: 1,
        description: 'Uma credencial foi emitida para um evento — evento, portador, tipo e nível no envelope.',
      },
      {
        type: 'accred.checkin.recorded',
        version: 1,
        description: 'Uma chegada foi registrada no portão — o carimbo do servidor, ato pontual imutável.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler nesta onda.
     * Ingresso/pagamento (Lei 3 + canta-siriema), QR/crachá/impressão
     * (integração) e check-out/reentrada são futuro DECLARADO na spec §5,
     * sem handler e sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  credentialManage: 'accred.credential.manage',
  checkinRecord: 'accred.checkin.record',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  credentialRegistered: 'accred.credential.registered',
  checkinRecorded: 'accred.checkin.recorded',
} as const;
