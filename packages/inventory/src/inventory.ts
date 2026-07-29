import type {
  BalanceState,
  InventoryItem,
  ItemBalance,
  ItemId,
  ItemStatus,
  MovementKind,
  NewItem,
  NewMovement,
  StockMovement,
} from './types.ts';

/**
 * O motor do estoque — **puro**.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca soma o livro à mão nem decide qual permissão
 * um movimento exige. Se `apps/` inteiro sumisse, nenhuma regra deste
 * arquivo sumiria junto.
 */

/**
 * ⭐ **AS TRANSIÇÕES PERMITIDAS.** Espelho exato de `inv.allowed_transition()`
 * em `supabase/migrations/0023_inv.sql` §2.1, e há teste que lê aquele
 * arquivo e compara par a par.
 *
 * `archived → active` EXISTE — é a decisão do Módulo 4 (`crm`) re-perguntada
 * e mantida: o item que volta ao catálogo é o MESMO item, e o livro dele é UM
 * livro. Obrigar um item novo partiria o histórico em dois — e o saldo junto.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [ItemStatus, ItemStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
] as const;

export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canArchive(status: ItemStatus): boolean {
  return canTransition(status, 'archived');
}

export function canReactivate(status: ItemStatus): boolean {
  return canTransition(status, 'active');
}

/**
 * ⭐ **O SINAL É DO TIPO, nunca do operador.** Entrada soma; saída subtrai; o
 * ajuste carrega o próprio sinal. É o espelho da coluna gerada
 * `signed_quantity` do banco — e há teste para os três tipos.
 */
export function signedQuantity(kind: MovementKind, quantity: number): number {
  return kind === 'out' ? -quantity : quantity;
}

/**
 * ⭐ **A PERMISSÃO DEPENDE DO TIPO DO MOVIMENTO.** Registrar entrada/saída é
 * operação; AJUSTAR é a mão que reescreve a contagem, e quem conta não é
 * necessariamente quem confere. Espelho da policy de INSERT do banco.
 */
export function permissionForMovement(
  kind: MovementKind,
): 'inv.movement.adjust' | 'inv.movement.register' {
  return kind === 'adjustment' ? 'inv.movement.adjust' : 'inv.movement.register';
}

/** O erro de validação de um item novo, ou `null` se ele está bom. */
export function validateNewItem(input: NewItem): string | null {
  if (input.description.trim().length === 0) {
    return 'O item precisa de uma descrição.';
  }
  if (input.unit.trim().length === 0) {
    return 'O item precisa de uma unidade — "un", "kg", "caixa", a que o tenant usar.';
  }
  if (input.sku != null && input.sku.trim().length === 0) {
    return 'SKU em branco não existe: ou o item tem código, ou o campo fica vazio.';
  }
  return null;
}

/**
 * O erro de validação de um movimento novo, ou `null`.
 *
 * ⭐ **O AJUSTE EXIGE RAZÃO.** "Ajuste" sem motivo é o buraco por onde todo
 * estoque do mundo vaza — a linha muda que esconde o desvio. Entrada e saída
 * têm razão opcional: receber mercadoria é autoexplicativo.
 */
export function validateNewMovement(input: NewMovement): string | null {
  if (input.itemId.trim().length === 0) {
    return 'O movimento precisa de um item.';
  }
  if (!Number.isFinite(input.quantity)) {
    return 'A quantidade precisa ser um número.';
  }
  if (input.kind === 'adjustment') {
    if (input.quantity === 0) {
      return 'Ajuste de zero não ajusta nada.';
    }
    if ((input.reason ?? '').trim().length === 0) {
      return 'Ajustar exige a razão: sem ela o livro registra a mudança e esconde o motivo.';
    }
  } else if (input.quantity <= 0) {
    return 'Entrada e saída são sempre positivas — o sinal é do tipo, nunca do operador.';
  }
  if (input.location != null && input.location !== '' && input.location.trim().length === 0) {
    return 'Local em branco não existe: ou o movimento tem local, ou o campo fica vazio.';
  }
  return null;
}

/**
 * ⭐ **O SALDO É SOMA DO LIVRO — e pode ser NEGATIVO.**
 *
 * A decisão de canon deste módulo (`0023_inv.sql` §4.1), re-perguntando o
 * overpay do `ar`: o físico já saiu; recusar a saída obrigaria o operador a
 * inventar uma entrada falsa para registrar uma saída verdadeira. O saldo
 * negativo aparece na tela dizendo "investigue" — a correção é um AJUSTE.
 */
export function balanceFor(
  movements: readonly StockMovement[],
  itemId: ItemId,
  location?: string | null,
): number {
  return movements
    .filter((m) => m.itemId === itemId)
    .filter((m) => location === undefined || m.location === location)
    .reduce((sum, m) => sum + signedQuantity(m.kind, m.quantity), 0);
}

/** O estado do saldo, para a tela pintar sem decidir. */
export function balanceState(balance: number): BalanceState {
  if (balance < 0) return 'negative';
  if (balance === 0) return 'zero';
  return 'ok';
}

/** O saldo de cada item, com o estado — a lista principal da tela. */
export function buildBalances(
  items: readonly InventoryItem[],
  movements: readonly StockMovement[],
): readonly ItemBalance[] {
  return items.map((item) => {
    const doItem = movements.filter((m) => m.itemId === item.id);
    const balance = doItem.reduce((sum, m) => sum + signedQuantity(m.kind, m.quantity), 0);
    return { item, balance, state: balanceState(balance), movementCount: doItem.length };
  });
}

/**
 * O EXTRATO de um item — o livro dele, do movimento mais recente ao mais
 * antigo. Ordena por `occurredAt` (quando o físico aconteceu), nunca pela
 * ordem de chegada do banco.
 */
export function ledgerFor(
  movements: readonly StockMovement[],
  itemId: ItemId,
): readonly StockMovement[] {
  return movements
    .filter((m) => m.itemId === itemId)
    .slice()
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : a.occurredAt > b.occurredAt ? -1 : 0));
}

/** A busca da lista de itens. Descrição, SKU e unidade — sem acento mágico. */
export function matchesItemQuery(item: InventoryItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return true;
  return (
    item.description.toLowerCase().includes(q) ||
    (item.sku ?? '').toLowerCase().includes(q) ||
    item.unit.toLowerCase().includes(q)
  );
}

/** Um resumo para o cabeçalho da tela. Contagem, nunca estimativa. */
export function summarizeInventory(
  items: readonly InventoryItem[],
  movements: readonly StockMovement[],
): {
  readonly items: number;
  readonly active: number;
  readonly archived: number;
  readonly movements: number;
  readonly negative: number;
} {
  const balances = buildBalances(items, movements);
  return {
    items: items.length,
    active: items.filter((i) => i.status === 'active').length,
    archived: items.filter((i) => i.status === 'archived').length,
    movements: movements.length,
    negative: balances.filter((b) => b.state === 'negative').length,
  };
}
