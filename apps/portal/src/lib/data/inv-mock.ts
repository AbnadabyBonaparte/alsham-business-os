import { PERMISSIONS, canTransition, validateNewMovement } from '@alsham/inventory';
import type { ItemStatus, NewItem, NewMovement } from '@alsham/inventory';

import { DataPortError } from './port';
import type { InvPort, ItemRow, MovementRow } from './inv-port';

const agora = () => new Date().toISOString();

let itemSeq = 1;
let movSeq = 1;

const items: ItemRow[] = [
  {
    id: 'mock-inv-item-1',
    tenantId: 'mock-tenant',
    description: 'Resma A4',
    unit: 'un',
    sku: 'RES-A4',
    status: 'active',
    createdAt: agora(),
  },
];

const movements: MovementRow[] = [
  {
    id: 'mock-inv-mov-1',
    itemId: 'mock-inv-item-1',
    kind: 'in',
    quantity: 20,
    reason: '',
    externalRef: 'NF demo',
    location: null,
    occurredAt: agora(),
    createdAt: agora(),
  },
];

export function createInvMockPort(): InvPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(Object.values(PERMISSIONS));
    },

    async loadItems() {
      return items.map((i) => ({ ...i }));
    },

    async loadMovements() {
      return movements.map((m) => ({ ...m }));
    },

    async createItem(item: NewItem) {
      const id = `mock-inv-item-${++itemSeq}`;
      items.unshift({
        id,
        tenantId: 'mock-tenant',
        description: item.description,
        unit: item.unit,
        sku: item.sku ?? null,
        status: 'active',
        createdAt: agora(),
      });
      return { itemId: id };
    },

    async updateItem(input) {
      const idx = items.findIndex((i) => i.id === input.itemId);
      if (idx < 0) throw new DataPortError('Item não encontrado.');
      items[idx] = {
        ...items[idx]!,
        description: input.description,
        unit: input.unit,
        sku: input.sku,
      };
    },

    async updateItemStatus(input: { itemId: string; status: ItemStatus }) {
      const idx = items.findIndex((i) => i.id === input.itemId);
      if (idx < 0) throw new DataPortError('Item não encontrado.');
      const atual = items[idx]!;
      if (!canTransition(atual.status, input.status)) {
        throw new DataPortError('Esta mudança de estado não existe no ciclo de vida.');
      }
      items[idx] = { ...atual, status: input.status };
    },

    async registerMovement(movement: NewMovement) {
      const erro = validateNewMovement(movement);
      if (erro !== null) throw new DataPortError(erro);
      const item = items.find((i) => i.id === movement.itemId);
      if (!item) throw new DataPortError('Item não encontrado.');
      if (item.status !== 'active') {
        throw new DataPortError('Item arquivado não movimenta: reative-o para lançar no livro.');
      }
      const id = `mock-inv-mov-${++movSeq}`;
      movements.unshift({
        id,
        itemId: movement.itemId,
        kind: movement.kind,
        quantity: movement.quantity,
        reason: movement.reason ?? '',
        externalRef: movement.externalRef ?? null,
        location: movement.location ?? null,
        occurredAt: agora(),
        createdAt: agora(),
      });
      return { movementId: id };
    },
  };
}
