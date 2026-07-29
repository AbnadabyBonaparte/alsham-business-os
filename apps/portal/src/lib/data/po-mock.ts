import { PERMISSIONS, canTransition } from '@alsham/purchase-orders';
import type { OrderStatus, PurchaseOrder } from '@alsham/purchase-orders';

import { DataPortError } from './port';
import type { OrderRow, PoPort } from './po-port';

const agora = () => new Date().toISOString();

let seq = 1;
const store: OrderRow[] = [
  {
    id: 'mock-po-1',
    externalRef: 'PO-DEMO-0001',
    currency: 'BRL',
    supplierName: 'Fornecedor Demo',
    counterpartyTaxId: null,
    description: 'Pedido de demonstração',
    totalCents: 15000,
    status: 'draft',
    createdAt: agora(),
    items: [
      {
        lineNo: 1,
        description: 'Resma A4',
        quantity: 10,
        unitAmountCents: 1500,
        qtyReceived: 0,
        lineTotalCents: 15000,
      },
    ],
  },
];

export function createPoMockPort(): PoPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(Object.values(PERMISSIONS));
    },

    async loadOrders() {
      return store.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i })) }));
    },

    async createOrder(order: PurchaseOrder) {
      const id = `mock-po-${++seq}`;
      store.unshift({
        ...order,
        id,
        createdAt: agora(),
        items: order.items.map((i) => ({ ...i })),
      });
      return { orderId: id };
    },

    async updateStatus(input: { orderId: string; status: OrderStatus }) {
      const idx = store.findIndex((o) => o.id === input.orderId);
      if (idx < 0) throw new DataPortError('Pedido não encontrado.');
      const atual = store[idx]!;
      if (!canTransition(atual.status, input.status)) {
        throw new DataPortError('Esta mudança de estado não existe no ciclo de vida.');
      }
      store[idx] = { ...atual, status: input.status };
    },

    async receiveLine(input: { orderId: string; lineNo: number; qtyReceived: number }) {
      const idx = store.findIndex((o) => o.id === input.orderId);
      if (idx < 0) throw new DataPortError('Pedido não encontrado.');
      const atual = store[idx]!;
      const items = atual.items.map((i) =>
        i.lineNo === input.lineNo ? { ...i, qtyReceived: input.qtyReceived } : i,
      );
      const any = items.some((i) => i.qtyReceived > 0);
      const allDone = items.every((i) => i.qtyReceived >= i.quantity);
      let status = atual.status;
      if (atual.status === 'submitted' || atual.status === 'partially_received') {
        if (allDone) status = 'received';
        else if (any) status = 'partially_received';
      }
      store[idx] = { ...atual, items, status };
    },
  };
}
