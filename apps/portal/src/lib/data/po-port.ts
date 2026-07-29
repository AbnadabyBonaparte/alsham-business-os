import type { OrderStatus, PurchaseOrder } from '@alsham/purchase-orders';

export interface OrderRow extends PurchaseOrder {
  readonly id: string;
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 6 — própria (Lei do Lego §5.5.8).
 * Sem DELETE: cancelar é status.
 */
export interface PoPort {
  readonly kind: 'mock' | 'supabase';

  listPermissions(): Promise<ReadonlySet<string>>;

  loadOrders(): Promise<OrderRow[]>;

  createOrder(order: PurchaseOrder): Promise<{ orderId: string }>;

  updateStatus(input: { orderId: string; status: OrderStatus }): Promise<void>;

  /** Atualiza qty_received de uma linha (exige po.order.receive no banco). */
  receiveLine(input: {
    orderId: string;
    lineNo: number;
    qtyReceived: number;
  }): Promise<void>;
}
