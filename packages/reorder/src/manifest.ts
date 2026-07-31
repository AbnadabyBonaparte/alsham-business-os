import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 47 — Estoque Mínimo (ponto de reabastecimento).
 *
 * `id` = `reorder` (o cinto de `emit_event` confere o prefixo `reorder.*`).
 * Domain `procurement` (Compras) — reposição é DECISÃO DE COMPRA, não de
 * contagem: o próprio `inv` declara *Estoque mínimo* como homônimo de Compras.
 * `consumes` VAZIO (Lei 7).
 *
 * ⭐⭐ A decisão-estrela do módulo: ele guarda SÓ a configuração; a comparação
 * "estoque atual < mínimo" é da camada de apresentação (`needsReorder()`), que
 * recebe o saldo do `inv` de fora. Este módulo NUNCA lê o `inv`.
 *
 * @see docs/canon/MODULO-REORDER-SPEC.md
 * @see supabase/migrations/0062_reorder.sql
 */
export const MANIFEST = {
  id: 'reorder',
  name: 'Estoque Mínimo',
  version: '0.1.0',
  summary:
    'A configuração do ponto de reabastecimento: produto em texto livre + quantidade mínima, com vínculo solto ao item de estoque. A comparação com o saldo é da tela — este módulo não lê o estoque. Ciclo active ↔ archived — a regra é configuração que volta (o DIVERGE do hr, onde o desligamento é terminal). Lote econômico, lead time e geração de pedido ficam de fora.',

  taxonomy: { layer: 'domain', domain: 'procurement' },

  capabilities: [{ key: 'reorder-rules', canonicalName: 'Estoque mínimo' }],

  permissions: [
    {
      key: 'reorder.rule.manage',
      moduleId: 'reorder',
      description: 'Cadastrar e editar regras de estoque mínimo (produto e quantidade mínima).',
    },
    {
      key: 'reorder.rule.decide',
      moduleId: 'reorder',
      description: 'Arquivar ou reativar uma regra — a configuração que sai e volta.',
    },
  ],

  events: {
    emits: [
      {
        type: 'reorder.rule.registered',
        version: 1,
        description: 'Uma regra de estoque mínimo nasceu no cadastro (sempre ativa).',
      },
      {
        type: 'reorder.rule.updated',
        version: 1,
        description: 'Mudou o produto, o vínculo com o item ou a quantidade mínima da regra.',
      },
      {
        type: 'reorder.rule.archived',
        version: 1,
        description: 'A regra foi arquivada. Continua no banco; nunca DELETE.',
      },
      {
        type: 'reorder.rule.reopened',
        version: 1,
        description: 'A regra arquivada voltou ao cadastro vivo — a mesma configuração.',
      },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

export const PERMISSIONS = {
  manage: 'reorder.rule.manage',
  decide: 'reorder.rule.decide',
} as const;

export const EVENTS = {
  registered: 'reorder.rule.registered',
  updated: 'reorder.rule.updated',
  archived: 'reorder.rule.archived',
  reopened: 'reorder.rule.reopened',
} as const;
