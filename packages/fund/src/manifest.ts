import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Fundo de Promoção.**
 *
 * ⚠️ **Por que o `id` é `fund`.** Curto, greppável, e sem colisão com a
 * frota (nenhum outro módulo do catálogo usa esse prefixo). ⭐ Vertical
 * `shopping-centers` — o TERCEIRO módulo vertical, junto do `mall` (Módulo
 * 38) e do `lease` (Módulo 39).
 *
 * @see docs/canon/MODULO-FUND-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0055_fund.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'fund',
  name: 'Fundo de Promoção',
  version: '0.1.0',
  summary:
    'O caixa coletivo do shopping: contribuições dos lojistas (id solto) e gastos com promoção — livro próprio, ato imutável. O saldo NUNCA fica negativo (o DIVERGE do bank/inv): gastar mais do que arrecadou não é produto financeiro, é descontrole — a constraint recusa.',

  /**
   * ⭐ Vertical `shopping-centers` — Taxonomia §6, "🛍 Shopping Centers (9)",
   * capacidade *Fundo de promoção*. A `VerticalKey` do `@alsham/core`.
   */
  taxonomy: { layer: 'vertical', vertical: 'shopping-centers' },

  capabilities: [{ key: 'promotion-fund', canonicalName: 'Fundo de promoção' }],

  /**
   * Duas permissões — contribuir é uma mão (manage de contribuição); gastar
   * é outra (manage de gasto), porque o gasto reescreve o saldo coletivo.
   */
  permissions: [
    {
      key: 'fund.contribution.manage',
      moduleId: 'fund',
      description: 'Registrar contribuições dos lojistas ao fundo — ato imutável.',
    },
    {
      key: 'fund.expense.manage',
      moduleId: 'fund',
      description: 'Registrar gastos do fundo (com razão) — recusados se estouram o saldo.',
    },
  ],

  events: {
    emits: [
      {
        type: 'fund.contribution.recorded',
        version: 1,
        description: 'Uma contribuição ao fundo foi registrada — lojista por id solto, competência e valor.',
      },
      {
        type: 'fund.expense.recorded',
        version: 1,
        description: 'Um gasto do fundo foi registrado — com razão; o saldo nunca fica negativo.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): quem contribui e quem gasta é
     * gente, pela tela — ninguém é escutado nesta onda.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  contribution: 'fund.contribution.manage',
  expense: 'fund.expense.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  contributionRecorded: 'fund.contribution.recorded',
  expenseRecorded: 'fund.expense.recorded',
} as const;
