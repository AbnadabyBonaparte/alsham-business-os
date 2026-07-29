/**
 * Os tipos do Módulo 8 — Estoque.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐ **A LEI DESTE MÓDULO vive neste arquivo por ausência: não existe campo de
 * saldo.** Procure por `quantity` em `InventoryItem` — não há, e não pode
 * haver. O saldo é a SOMA do livro (`StockMovement[]`), calculada na leitura.
 * Um número editável esquece como chegou lá; um livro imutável lembra tudo.
 *
 * @see supabase/migrations/0023_inv.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-INV-SPEC.md — o fluxo de negócio
 */

/** Identificadores. Aliases nominais para o que no banco é `uuid`. */
export type ItemId = string;
export type MovementId = string;
export type TenantId = string;

/**
 * O estado de um item. Arquivar é status — item com livro é história, e
 * apagá-lo deixaria movimentos órfãos de contexto.
 */
export type ItemStatus = 'active' | 'archived';

/**
 * O tipo de um movimento no livro.
 *
 * ⭐ O SINAL é do tipo, nunca do operador: entrada soma, saída subtrai. Só o
 * AJUSTE aceita quantidade negativa — ajustar para menos (quebra, perda,
 * contagem que achou menos) é o caso clássico.
 */
export type MovementKind = 'in' | 'out' | 'adjustment';

/**
 * Um item de estoque, como o tenant o descreve.
 *
 * ANTI-VIÉS: `description` e `unit` são TEXTO LIVRE; `sku` é OPCIONAL, do
 * tenant, sem formato. Catálogo rico (NCM, categoria, foto) é capacidade
 * futura DECLARADA — nunca meia-entrega aqui.
 */
export interface InventoryItem {
  readonly id: ItemId;
  readonly tenantId: TenantId;
  readonly description: string;
  /** "un", "kg", "caixa", "m²", "hora" — a unidade é do tenant. */
  readonly unit: string;
  /** O código DO TENANT, se ele tiver um. Nunca obrigatório, nunca formato. */
  readonly sku: string | null;
  readonly status: ItemStatus;
}

/**
 * Uma linha do livro — imutável por contrato, nas três camadas do banco.
 *
 * Corrigir não é editar: é lançar um AJUSTE com razão, que fica no livro
 * para sempre. É o padrão do `usage_ledger` (kraken-v2, PROVADO) e da trilha
 * do `ops`.
 */
export interface StockMovement {
  readonly id: MovementId;
  readonly itemId: ItemId;
  readonly kind: MovementKind;
  /** Sempre positiva em entrada/saída; no ajuste, o sinal é do operador. */
  readonly quantity: number;
  /** Por que este movimento existe. OBRIGATÓRIA no ajuste. */
  readonly reason: string;
  /** Nota, pedido, romaneio — a referência do MUNDO, opaca para nós. */
  readonly externalRef: string | null;
  /** TEXTO LIVRE: "depósito 1", "loja centro". Multi-depósito é futuro. */
  readonly location: string | null;
  /** Quando o movimento físico aconteceu (ISO). O livro aceita o passado. */
  readonly occurredAt: string;
}

/** O que se precisa saber para cadastrar um item. */
export interface NewItem {
  readonly description: string;
  readonly unit: string;
  readonly sku?: string | null;
}

/** O que se precisa saber para lançar um movimento. */
export interface NewMovement {
  readonly itemId: ItemId;
  readonly kind: MovementKind;
  readonly quantity: number;
  readonly reason?: string;
  readonly externalRef?: string | null;
  readonly location?: string | null;
}

/**
 * O estado do saldo, para a tela. `negative` não é erro — é o livro dizendo
 * "estou incompleto ou algo sumiu; investigue". Ver a decisão em
 * `0023_inv.sql` §4.1.
 */
export type BalanceState = 'ok' | 'zero' | 'negative';

/** O saldo calculado de um item — consequência do livro, nunca coluna. */
export interface ItemBalance {
  readonly item: InventoryItem;
  readonly balance: number;
  readonly state: BalanceState;
  readonly movementCount: number;
}
