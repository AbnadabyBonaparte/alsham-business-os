import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do Módulo 84 — Créditos de Compensação (Creditbalance).**
 *
 * `id` = `creditbalance` (o cinto de `emit_event` confere o prefixo
 * `creditbalance.*`). ⭐ É módulo VERTICAL do catálogo: `taxonomy.layer =
 * 'vertical'`, `vertical` `energy` (☀️ Energia). `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ A física é a do LANÇAMENTO IMUTÁVEL (o `loyalty`): o crédito de energia é
 * fato consumado — nasce e nunca muda; corrigir é lançar o ato inverso.
 * ⭐⭐ A DIREÇÃO mora no TIPO (`credit_type` generated/consumed — a "sinal do
 * tipo" do `cash`); `quantity_kwh` é SEMPRE > 0 e o saldo é uma VIEW (Σ generated
 * − Σ consumed).
 * ⭐⭐ A TERCEIRA RESPOSTA: consumir mais que o saldo é RECUSADO — NÃO por cópia do
 * `loyalty`, mas pela física da compensação (crédito é energia realmente gerada;
 * saldo negativo inventaria energia inexistente — a razão infísica do `esg`).
 * Validade (60 meses) e abatimento na fatura ficam FORA.
 *
 * @see docs/canon/MODULO-CREDITBALANCE-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0099_creditbalance.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'creditbalance',
  name: 'Créditos de Compensação',
  version: '0.1.0',
  summary:
    'O livro de créditos de energia (o SCEE/ANEEL): quando a usina injeta mais do que consome, o excedente vira crédito (kWh) que abate consumo depois. Cada lançamento é IMUTÁVEL (a física do loyalty), a direção mora no credit_type (generated soma / consumed subtrai), quantity_kwh sempre > 0, e o saldo é VIEW (Σ generated − Σ consumed). ⭐⭐ Consumir mais que o saldo é RECUSADO — NÃO por cópia do loyalty, mas pela física da compensação: crédito é energia realmente gerada, e um saldo negativo inventaria energia inexistente (a razão infísica do esg). A terceira resposta ao "pode ficar negativo?", por física própria: bank/inv permitem, loyalty/invest recusam por promessa/posse, creditbalance recusa porque energia não se deve, se gera. Assinatura por id solto opcional. Validade (60 meses) e abatimento na fatura ficam FORA. consumes VAZIO.',

  /**
   * ⭐ **Vertical `energy` — Taxonomia §6, "☀️ Energia"**, capacidade *Créditos
   * de compensação*. A chave é a `VerticalKey` do `@alsham/core` — a Store gradua
   * a pill de Energia por ela (store-taxonomy `key: 'energy'`).
   */
  taxonomy: { layer: 'vertical', vertical: 'energy' },

  capabilities: [{ key: 'compensation-credits', canonicalName: 'Créditos de compensação' }],

  /**
   * UMA permissão só: lançar um crédito (gerado ou consumido) é uma mão. Não há
   * ARQUIVAR/REABRIR (o livro imutável não tem ciclo de vida), então não há
   * `decide`.
   */
  permissions: [
    {
      key: 'creditbalance.entry.manage',
      moduleId: 'creditbalance',
      description: 'Lançar um crédito de energia (gerado ou consumido/compensado), com a assinatura de origem.',
    },
  ],

  events: {
    emits: [
      {
        type: 'creditbalance.credit.generated',
        version: 1,
        description: 'Crédito de energia gerado (excedente injetado). Lançamento imutável.',
      },
      {
        type: 'creditbalance.credit.consumed',
        version: 1,
        description: 'Crédito de energia consumido (compensação). Só passa se o saldo cobrir — energia não se deve.',
      },
    ],

    /**
     * VAZIO por decisão de canon (Lei 7): nenhum handler de créditos existe.
     * Validade (60 meses) e abatimento na fatura são futuro DECLARADO na spec,
     * sem handler e sem promessa.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'creditbalance.entry.manage',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  generated: 'creditbalance.credit.generated',
  consumed: 'creditbalance.credit.consumed',
} as const;
