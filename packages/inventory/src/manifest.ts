import type { ModuleManifest } from '@alsham/core';

/**
 * **O manifesto do módulo Estoque.**
 *
 * ⚠️ **Por que o `id` é `inv`.** O cinto de `emit_event()` confere o prefixo
 * do evento (`<moduleId>.<agregado>.<fato>`), e as guardas de CI procuram
 * `<modulo>.` por grep com fronteira de palavra. `inv.` foi conferido contra
 * o código de todas as migrations existentes antes de nascer: zero colisões.
 * `estoque` quebraria o padrão em inglês dos fatos; `stock` colide com
 * vocabulário de mercado financeiro.
 *
 * @see docs/canon/CORE-SPEC.md — o ciclo de vida que este objeto atravessa
 * @see docs/canon/MODULO-INV-SPEC.md — o fluxo de negócio
 * @see supabase/migrations/0023_inv.sql — o schema que o sustenta
 */
export const MANIFEST = {
  id: 'inv',
  name: 'Estoque',
  version: '0.1.0',
  summary:
    'O estoque como livro de movimentos imutável: entrada, saída e ajuste com razão. O saldo é a soma do livro — calculado, nunca editado.',

  /**
   * ⭐ **Domain `operations` — Taxonomia §5, "🏭 Operações (10)", onde
   * *Estoque* está listado por extenso**, ao lado de *Almoxarifado* e
   * *Inventário*.
   *
   * ⚠️ Os homônimos que NÃO são este módulo: *Estoque mínimo* é capacidade de
   * COMPRAS (`procurement`) — reposição é decisão de compra, não de contagem;
   * *Inventário de carbono* é de ESG; *Estoque de varejo/produtos/insumos*
   * são de verticais. Sol Único: uma palavra, um dono por contexto.
   */
  taxonomy: { layer: 'domain', domain: 'operations' },

  /**
   * **Uma capacidade. Uma só.**
   *
   * O Domain lista dez. *Ordens de serviço* já é do Módulo 7. *Almoxarifado*
   * e *Inventário* são as que mais tentam entrar de carona — almoxarifado é
   * multi-depósito ESTRUTURADO (aqui o local é texto livre do movimento), e
   * inventário é a CONTAGEM PERIÓDICA com conferência e fechamento (aqui
   * existe só o ajuste avulso). Listá-las seria vender o que não existe.
   */
  capabilities: [{ key: 'stock', canonicalName: 'Estoque' }],

  /**
   * Três permissões, e a fronteira entre a segunda e a terceira é a decisão
   * de produto deste módulo: **quem movimenta não é necessariamente quem
   * ajusta.** O ajuste reescreve a contagem — é a mão que corrige o livro, e
   * a policy de INSERT do banco confere o tipo do movimento contra ela.
   */
  permissions: [
    {
      key: 'inv.item.manage',
      moduleId: 'inv',
      description: 'Cadastrar e editar itens, arquivá-los e reativá-los. Nunca apagar.',
    },
    {
      key: 'inv.movement.register',
      moduleId: 'inv',
      description: 'Lançar entradas e saídas no livro de movimentos.',
    },
    {
      key: 'inv.movement.adjust',
      moduleId: 'inv',
      description:
        'Lançar AJUSTES — o movimento que reescreve a contagem, sempre com razão obrigatória.',
    },
  ],

  events: {
    /**
     * ⭐ O payload é AUTOSSUFICIENTE: o movimento leva a descrição e a unidade
     * do item — e o SALDO RESULTANTE, somado no instante do fato, porque quem
     * escuta não tem como somar um livro que não pode ler.
     */
    emits: [
      {
        type: 'inv.item.registered',
        version: 1,
        description: 'Um item entrou no catálogo do tenant, com descrição, unidade e SKU opcional.',
      },
      {
        type: 'inv.item.updated',
        version: 1,
        description:
          'Mudou fato do item: descrição, unidade, SKU — ou ele voltou do arquivo (reativar não tem fato próprio).',
      },
      {
        type: 'inv.item.archived',
        version: 1,
        description:
          'O item foi arquivado — a ação destrutiva deste módulo. O livro dele continua inteiro; item arquivado não movimenta.',
      },
      {
        type: 'inv.movement.registered',
        version: 1,
        description:
          'Uma linha entrou no livro: entrada, saída ou ajuste com razão, com o item pelo nome e o saldo resultante.',
      },
    ],

    /**
     * **Vazio, e é Lei 7.**
     *
     * A integração óbvia existe: o RECEBIMENTO do Módulo 6 (`po`) virar
     * entrada no livro. **Não entra, porque construí-la hoje seria adivinhar
     * em dois pontos**, e o caminho está declarado na spec (§6):
     *
     * 1. o `po` emite `po.order.updated` com o estado ACUMULADO das linhas
     *    (`qtyReceived` total), nunca o DELTA do recebimento — o consumidor
     *    teria de guardar o estado anterior e diferenciá-lo;
     * 2. a linha do pedido é TEXTO LIVRE por decisão de canon do próprio
     *    `po` (sem catálogo, sem SKU) — não existe vínculo entre "Parafuso
     *    8mm" do pedido e um item deste estoque, e inventá-lo por nome seria
     *    casar por adivinhação.
     *
     * Quando entrar, entra com handler completo e teste triangular no padrão
     * da Etapa 10, lendo `envelope.producedBy`.
     */
    consumes: [],
  },

  requiresCore: '0.0.x',
} as const satisfies ModuleManifest;

/** As chaves de permissão deste módulo, para uso tipado. */
export const PERMISSIONS = {
  itemManage: 'inv.item.manage',
  movementRegister: 'inv.movement.register',
  movementAdjust: 'inv.movement.adjust',
} as const;

/** Os tipos de evento que este módulo emite, para uso tipado. */
export const EVENTS = {
  itemRegistered: 'inv.item.registered',
  itemUpdated: 'inv.item.updated',
  itemArchived: 'inv.item.archived',
  movementRegistered: 'inv.movement.registered',
} as const;
