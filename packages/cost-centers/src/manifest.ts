import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Centros de Custo & Rateio.**
 *
 * ⚠️ **Por que o `id` é `cc`.** Abreviação consagrada de "centro de custo",
 * greppável com fronteira (`cc.`), zero colisões na frota.
 *
 * ⚠️ **Por que o Domain é `finance`.** Rateio de custo entre centros é
 * ofício do 💰 Financeiro — a mesma casa do `cash`. O centro é dado do
 * tenant; a regra fecha 100% (física); a execução é ato de gente.
 *
 * @see docs/canon/MODULO-CC-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0043_cc.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'cc',
  name: 'Centros de Custo & Rateio',
  version: '0.1.0',
  summary:
    'Os centros de custo do tenant (que voltam do arquivo), as regras de rateio que fecham 100% ao ativar, e a execução como ato de gente: lançamentos imutáveis, um por centro, sem perder centavo — com a origem por id solto e nome carimbado.',

  taxonomy: { layer: 'domain', domain: 'finance' },

  capabilities: [
    { key: 'cost-centers', canonicalName: 'Centros de custo' },
    { key: 'cost-allocation', canonicalName: 'Rateio' },
  ],

  permissions: [
    {
      key: 'cc.center.manage',
      moduleId: 'cc',
      description: 'Cadastrar centros de custo, arquivar e devolver ao ativo.',
    },
    {
      key: 'cc.rule.design',
      moduleId: 'cc',
      description: 'Desenhar as regras de rateio: centros e percentuais; ativar (exige 100%) e arquivar.',
    },
    {
      key: 'cc.rateio.execute',
      moduleId: 'cc',
      description: 'Executar uma regra ativa sobre um valor, gerando os lançamentos de rateio (ato de gente).',
    },
  ],

  events: {
    emits: [
      { type: 'cc.center.registered', version: 1, description: 'Um centro de custo entrou no cadastro.' },
      { type: 'cc.center.archived', version: 1, description: 'Um centro saiu de uso — a história e as execuções ficam.' },
      { type: 'cc.rule.activated', version: 1, description: 'Uma regra fechou 100% e passou a ratear.' },
      {
        type: 'cc.rateio.executed',
        version: 1,
        description: 'Um rateio foi executado — a regra, a origem pelo nome e o total no envelope; os valores por centro ficam no livro.',
      },
    ],

    /**
     * VAZIO e honesto (Lei 7): quem executa o rateio é gente, não um relógio
     * nem um evento. Rateio por consumo (executar quando um custo entra) é
     * capacidade futura declarada — exigiria a regra de exclusividade de
     * fonte que ninguém desenhou (a lição do `cash`).
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'cc.center.manage',
  design: 'cc.rule.design',
  execute: 'cc.rateio.execute',
} as const;

export const EVENTS = {
  centerRegistered: 'cc.center.registered',
  centerArchived: 'cc.center.archived',
  ruleActivated: 'cc.rule.activated',
  rateioExecuted: 'cc.rateio.executed',
} as const;
