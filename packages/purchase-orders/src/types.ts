/**
 * Tipos do Módulo 6 — Compras (Pedidos).
 *
 * Fornecedor neutro: `supplierName` + `counterpartyTaxId` (mesmos nomes do AP).
 * Item = texto + quantidade + unitário em cents — sem SKU/NCM/catálogo.
 */

export type OrderStatus =
  | 'draft'
  | 'submitted'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export interface OrderItem {
  readonly lineNo: number;
  readonly description: string;
  /** Quantidade pedida (> 0). */
  readonly quantity: number;
  readonly unitAmountCents: number;
  /** Pode ser maior que `quantity` (over-receive permitido). */
  readonly qtyReceived: number;
  readonly lineTotalCents: number;
}

export interface PurchaseOrder {
  readonly externalRef: string;
  readonly currency: string;
  readonly supplierName: string | null;
  readonly counterpartyTaxId: string | null;
  readonly description: string;
  readonly totalCents: number;
  readonly status: OrderStatus;
  readonly items: readonly OrderItem[];
}

export interface NewOrderItemInput {
  readonly description?: unknown;
  readonly quantity?: unknown;
  readonly unitAmountCents?: unknown;
}

export interface NewOrderInput {
  readonly externalRef?: unknown;
  readonly currency?: unknown;
  readonly supplierName?: unknown;
  readonly counterpartyTaxId?: unknown;
  readonly description?: unknown;
  readonly items?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
