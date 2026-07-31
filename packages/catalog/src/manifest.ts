import type { ModuleManifest } from '@alsham/core';

/**
 * Manifesto do Módulo 72 — Catálogo de Produtos.
 *
 * `id` = `catalog` (o cinto de `emit_event` confere o prefixo `catalog.*`).
 * ⭐ É um módulo VERTICAL: `taxonomy.layer = 'vertical'`, `vertical = 'retail'`
 * (🛒 Varejo & Supermercados). `consumes` VAZIO (Lei 7).
 *
 * O catálogo é o cadastro do que a loja vende: SKU TEXTO LIVRE opcional, nome e
 * o preço de TABELA (valor + moeda). ⭐ `active ↔ archived` (a física do
 * `vendor` — o DIVERGE do `hr`, onde `terminated` é terminal): o produto
 * descontinuado que a loja volta a vender é o MESMO produto, e obrigá-lo a
 * renascer partiria o histórico de venda em dois.
 *
 * ⛔ FORA: estoque de varejo (é o `inv` genérico, id solto), variação/grade,
 * imagem do produto (Storage do Core não construído) e Marketplace próprio
 * (integração futura).
 *
 * @see docs/canon/MODULO-CATALOG-SPEC.md
 * @see supabase/migrations/0087_catalog.sql
 */
export const MANIFEST = {
  id: 'catalog',
  name: 'Catálogo de Produtos',
  version: '0.1.0',
  summary:
    'O cadastro do que a loja vende: o nome, um SKU TEXTO LIVRE opcional (nem toda casa usa código — a padaria vende "pão francês" sem SKU) e o preço de TABELA (valor em centavos + moeda, juntos). É o "quanto custa hoje"; o preço EFETIVO da venda vive no item do cupom (pdv). active ↔ archived (o produto descontinuado que volta é o MESMO produto — a física do vendor, o DIVERGE do hr onde terminated é terminal). FORA: estoque de varejo (é o inv genérico, id solto), variação/grade, imagem do produto (Storage do Core não construído) e Marketplace próprio (integração futura). consumes VAZIO.',

  taxonomy: { layer: 'vertical', vertical: 'retail' },

  capabilities: [{ key: 'product-catalog', canonicalName: 'Catálogo' }],

  permissions: [
    {
      key: 'catalog.product.manage',
      moduleId: 'catalog',
      description: 'Cadastrar produtos e editar dados (nome, SKU, preço de tabela).',
    },
    {
      key: 'catalog.product.decide',
      moduleId: 'catalog',
      description: 'Arquivar ou reativar um produto — tira/põe no catálogo vivo.',
    },
  ],

  events: {
    emits: [
      { type: 'catalog.product.registered', version: 1, description: 'Um produto foi cadastrado no catálogo.' },
      { type: 'catalog.product.updated', version: 1, description: 'Os dados de um produto mudaram.' },
      { type: 'catalog.product.archived', version: 1, description: 'O produto saiu do catálogo vivo — reversível.' },
      { type: 'catalog.product.reopened', version: 1, description: 'O produto voltou ao catálogo — o mesmo produto.' },
    ],
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  manage: 'catalog.product.manage',
  decide: 'catalog.product.decide',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  registered: 'catalog.product.registered',
  updated: 'catalog.product.updated',
  archived: 'catalog.product.archived',
  reopened: 'catalog.product.reopened',
} as const;
