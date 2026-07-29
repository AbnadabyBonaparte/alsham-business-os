/**
 * `@alsham/inventory` — Módulo 8, Estoque.
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI. O que este pacote
 * sabe é como um livro de movimentos se lê, como o saldo nasce da soma e
 * quando um lançamento é válido. Quem grava é o schema `inv`; quem mostra é
 * o portal; quem conta ao mundo é o correio.
 *
 * ⭐ **A lei do módulo está aqui pelo que NÃO existe:** não há campo de saldo
 * em tipo nenhum. O dia em que alguém escrever `quantityOnHand` num item é o
 * dia em que o estoque vira um número que esquece como chegou lá.
 *
 * ⚠️ Este pacote **não importa nenhum outro módulo**, e não vai importar. Há
 * guarda no CI ("módulo não conhece módulo") que confere isso nos dois
 * sentidos, para os doze módulos.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  canArchive,
  canReactivate,
  signedQuantity,
  permissionForMovement,
  validateNewItem,
  validateNewMovement,
  balanceFor,
  balanceState,
  buildBalances,
  ledgerFor,
  matchesItemQuery,
  summarizeInventory,
} from './inventory.ts';

export type {
  BalanceState,
  InventoryItem,
  ItemBalance,
  ItemId,
  ItemStatus,
  MovementId,
  MovementKind,
  NewItem,
  NewMovement,
  StockMovement,
  TenantId,
} from './types.ts';
