import type { InventoryItem, ItemStatus, NewItem, NewMovement, StockMovement } from '@alsham/inventory';

export interface ItemRow extends InventoryItem {
  readonly createdAt: string;
}

export interface MovementRow extends StockMovement {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 8 — própria (Lei do Lego §5.5.8).
 *
 * Sem DELETE em lugar nenhum: arquivar item é status, e o livro de
 * movimentos não se edita nem se apaga — corrigir é lançar AJUSTE.
 * Repare que não há `updateMovement`: a operação não existe no banco,
 * e a porta não promete o que o schema nega.
 */
export interface InvPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadItems(): Promise<ItemRow[]>;
  loadMovements(): Promise<MovementRow[]>;
  createItem(item: NewItem): Promise<{ itemId: string }>;
  updateItem(input: {
    itemId: string;
    description: string;
    unit: string;
    sku: string | null;
  }): Promise<void>;
  updateItemStatus(input: { itemId: string; status: ItemStatus }): Promise<void>;
  registerMovement(movement: NewMovement): Promise<{ movementId: string }>;
}
