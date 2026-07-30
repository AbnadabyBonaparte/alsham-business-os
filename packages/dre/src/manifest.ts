import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do Módulo 32 — DRE Gerencial.**
 *
 * ⚠️ **Por que o `id` é `dre`.** A sigla consagrada de Demonstração do
 * Resultado do Exercício; greppável com fronteira, zero colisões na frota.
 *
 * ⛔ **Gerencial, NÃO fiscal (Lei 3):** sem SPED/ECD/ECF. ⭐⭐ `consumes` NÃO é
 * vazio — escuta `cash.entry.registered` E `cc.rateio.executed`, com handler
 * construído (`realized.ts`, dois produtores). Esta onda EXIGE redeploy do
 * `apps/api`.
 *
 * @see docs/canon/MODULO-DRE-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0047_dre.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'dre',
  name: 'DRE Gerencial',
  version: '0.1.0',
  summary:
    'A leitura gerencial do resultado (não fiscal): as linhas que o tenant desenha, com os valores nascendo dos livros do Fluxo de Caixa e dos Rateios — projetados por evento. Totais e subtotais são calculados; linha sem lançamento não aparece.',

  /**
   * ⭐ **Domain `finance` — Taxonomia §5, "💰 Financeiro (19)"**, capacidade
   * *DRE*.
   */
  taxonomy: { layer: 'domain', domain: 'finance' },

  capabilities: [{ key: 'income-statement', canonicalName: 'DRE' }],

  /**
   * Duas permissões: DESENHAR o plano de linhas e LER o demonstrativo — quem
   * monta a estrutura não é, necessariamente, quem apenas consulta o resultado.
   */
  permissions: [
    {
      key: 'dre.line.manage',
      moduleId: 'dre',
      description: 'Desenhar o plano de linhas da DRE: nome, natureza (receita/custo/despesa) e a categoria que casa.',
    },
    {
      key: 'dre.statement.read',
      moduleId: 'dre',
      description: 'Ler o demonstrativo e o resultado — sem poder alterar o plano.',
    },
  ],

  events: {
    emits: [
      {
        type: 'dre.line.registered',
        version: 1,
        description: 'Uma linha entrou no plano da DRE.',
      },
      {
        type: 'dre.line.archived',
        version: 1,
        description: 'Uma linha saiu do plano — o histórico dela continua nos livros.',
      },
    ],

    /**
     * ⭐⭐ **NÃO É VAZIO — DOIS produtores, um handler (Lei 7 do jeito certo).**
     *
     * A DRE não lança nada: os valores nascem dos livros. Escuta o caixa e o
     * rateio sem importar o `cashflow` nem o `cost-centers`, sem ler os schemas
     * deles e sem conhecer o correio — o acoplamento é com o TIPO do evento
     * (guarda "módulo não conhece módulo" no CI). O tradutor lê a origem de
     * `envelope.producedBy`.
     */
    consumes: [
      {
        type: 'cash.entry.registered',
        version: 1,
        description: 'Um lançamento de caixa — vira valor da linha que casa a categoria.',
      },
      {
        type: 'cc.rateio.executed',
        version: 1,
        description: 'Um custo rateado — vira valor (negativo) da linha que casa a origem do rateio.',
      },
    ],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manageLine: 'dre.line.manage',
  readStatement: 'dre.statement.read',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  lineRegistered: 'dre.line.registered',
  lineArchived: 'dre.line.archived',
} as const;
