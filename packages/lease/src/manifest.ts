import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Locação de Lojistas.**
 *
 * ⚠️ **Por que o `id` é `lease`.** Curto, greppável, e neutro — zero colisão
 * de fronteira de palavra no canon. ⭐ Segundo módulo VERTICAL do catálogo:
 * `taxonomy.layer = 'vertical'`, `vertical = 'shopping-centers'`.
 *
 * @see docs/canon/MODULO-LEASE-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0054_lease.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'lease',
  name: 'Locação de Lojistas',
  version: '0.1.0',
  summary:
    'A camada comercial da locação do shopping: o contrato vive no ctr (id solto); aqui mora o termo comercial sobre vendas (percentual/regra em texto livre, dado do tenant) e o relatório mensal de vendas do lojista — ato imutável, registrado por gente (sem POS integrado).',

  /**
   * ⭐ Vertical `shopping-centers` — Taxonomia §6, "🛍 Shopping Centers",
   * capacidade *Contratos de locação*.
   */
  taxonomy: { layer: 'vertical', vertical: 'shopping-centers' },

  capabilities: [{ key: 'lease-agreements', canonicalName: 'Contratos de locação' }],

  /**
   * ⭐ Duas permissões, mas SEM o par manage/decide do mall e do ctr:
   * `agreement.manage` cobre registrar E encerrar (a camada fina não tem
   * física própria); `report.manage` é o relatório de vendas, à parte.
   */
  permissions: [
    {
      key: 'lease.agreement.manage',
      moduleId: 'lease',
      description:
        'Registrar a locação comercial (contrato por id solto, lojista por id solto, termo sobre vendas) e encerrá-la.',
    },
    {
      key: 'lease.report.manage',
      moduleId: 'lease',
      description: 'Registrar o relatório mensal de vendas do lojista — ato imutável.',
    },
  ],

  events: {
    emits: [
      {
        type: 'lease.agreement.registered',
        version: 1,
        description: 'Uma locação comercial foi registrada — contrato e lojista por id solto, termo sobre vendas.',
      },
      {
        type: 'lease.agreement.ended',
        version: 1,
        description: 'A locação comercial foi encerrada. Terminal.',
      },
      {
        type: 'lease.report.recorded',
        version: 1,
        description: 'Um relatório de vendas do lojista foi registrado — ato imutável, com competência e valor.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): cruzar com `ctr.contract.*`
     * (ex.: encerrar a locação quando o contrato termina) é integração
     * futura, declarada FORA na spec §5 — sem handler, sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  agreementManage: 'lease.agreement.manage',
  reportManage: 'lease.report.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  agreementRegistered: 'lease.agreement.registered',
  agreementEnded: 'lease.agreement.ended',
  reportRecorded: 'lease.report.recorded',
} as const;
