/**
 * `@alsham/purchase-orders` — Módulo 6, Compras (Pedidos).
 *
 * Domínio PURO. Não importa nenhum outro módulo.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  nextStatuses,
  statusForReceipt,
  validateNewOrder,
  canCancel,
  canSubmit,
  canReceive,
  lineTotalCents,
  sumItems,
} from './order.ts';

export type {
  PurchaseOrder,
  OrderItem,
  OrderStatus,
  NewOrderInput,
  NewOrderItemInput,
  Problem,
  Validation,
} from './types.ts';
