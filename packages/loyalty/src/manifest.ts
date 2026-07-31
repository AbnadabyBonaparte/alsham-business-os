import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do Módulo 74 — Fidelidade (Loyalty).**
 *
 * `id` = `loyalty` (o cinto de `emit_event` confere o prefixo `loyalty.*`). ⭐ É
 * módulo VERTICAL do catálogo: `taxonomy.layer = 'vertical'`, `vertical`
 * `retail` (🛒 Varejo & Supermercados). `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ A física é a do LANÇAMENTO IMUTÁVEL (o `timesheet`): o movimento de pontos
 * é fato consumado — nasce e nunca muda; corrigir é lançar o ato inverso.
 * ⭐⭐ A DIREÇÃO mora no TIPO (`entry_type` earn/redeem — a "sinal do tipo" do
 * `cash`); `points` é SEMPRE > 0 e o saldo é uma VIEW (Σ earn − Σ redeem).
 * ⭐⭐ A TERCEIRA RESPOSTA: resgatar mais que o saldo é RECUSADO (a física do
 * `invest`). Conversão pontos↔dinheiro e expiração automática ficam FORA.
 *
 * @see docs/canon/MODULO-LOYALTY-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0089_loyalty.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'loyalty',
  name: 'Fidelidade',
  version: '0.1.0',
  summary:
    'O livro de pontos do varejo: cada movimento é um lançamento imutável — o cliente (id solto + nome), a direção no entry_type (earn soma, redeem subtrai — a sinal do tipo do cash), os pontos (sempre > 0) e a venda de origem (id solto opcional). Registrar é fato consumado; corrigir é lançar o ato inverso, nunca reescrever. O saldo é uma VIEW (Σ earn − Σ redeem), nunca coluna. Resgatar mais que o saldo é RECUSADO — a terceira resposta, a física do invest. Conversão pontos↔dinheiro (regra de acúmulo), expiração automática por relógio e catálogo de recompensas ficam de fora. consumes VAZIO.',

  /**
   * ⭐ **Vertical `retail` — Taxonomia §6, "🛒 Varejo & Supermercados (7)"**,
   * capacidade *Fidelidade*. A chave é a `VerticalKey` do `@alsham/core` — a
   * Store gradua a pill de Varejo por ela (store-taxonomy `key: 'retail'`).
   */
  taxonomy: { layer: 'vertical', vertical: 'retail' },

  capabilities: [{ key: 'loyalty', canonicalName: 'Fidelidade' }],

  /**
   * UMA permissão só: lançar um movimento (ganhar ou resgatar) é uma mão. Não há
   * ARQUIVAR/REABRIR (o livro imutável não tem ciclo de vida), então não há
   * `decide`.
   */
  permissions: [
    {
      key: 'loyalty.entry.manage',
      moduleId: 'loyalty',
      description: 'Lançar um movimento de pontos — o cliente, a direção (earn/redeem), os pontos e a venda de origem.',
    },
  ],

  events: {
    emits: [
      {
        type: 'loyalty.points.earned',
        version: 1,
        description: 'O cliente ganhou pontos. Lançamento imutável desde o instante 1.',
      },
      {
        type: 'loyalty.points.redeemed',
        version: 1,
        description: 'O cliente resgatou pontos. Só passa se o saldo cobrir (a física do invest).',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler de fidelidade existe.
     * Conversão pontos↔dinheiro e expiração automática são futuro DECLARADO na
     * spec, sem handler e sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'loyalty.entry.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  earned: 'loyalty.points.earned',
  redeemed: 'loyalty.points.redeemed',
} as const;
