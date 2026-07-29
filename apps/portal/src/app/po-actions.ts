'use server';

import { revalidatePath } from 'next/cache';

import {
  canTransition,
  validateNewOrder,
  canCancel,
  canSubmit,
  canReceive,
} from '@alsham/purchase-orders';
import type { NewOrderInput, OrderStatus } from '@alsham/purchase-orders';

import { getPoPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export interface RegisterFailure {
  readonly ok: false;
  readonly message: string;
  readonly problems?: readonly { field: string; message: string }[];
}

export async function registerOrder(
  input: NewOrderInput,
): Promise<ActionResult<{ orderId: string }> | RegisterFailure> {
  const validado = validateNewOrder(input);
  if (!validado.ok) {
    return { ok: false, message: 'Confira os campos destacados.', problems: validado.problems };
  }

  try {
    const port = await getPoPort();
    const { orderId } = await port.createOrder(validado.value);
    revalidatePath('/compras');
    return { ok: true, data: { orderId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function submitOrder(input: { orderId: string }): Promise<ActionResult> {
  try {
    const port = await getPoPort();
    const orders = await port.loadOrders();
    const order = orders.find((o) => o.id === input.orderId);
    if (!order) return { ok: false, message: 'Pedido não encontrado.' };
    if (!canSubmit(order.status) || !canTransition(order.status, 'submitted')) {
      return { ok: false, message: 'Só rascunho pode ser enviado.' };
    }
    await port.updateStatus({ orderId: input.orderId, status: 'submitted' });
    revalidatePath('/compras');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function cancelOrder(input: { orderId: string }): Promise<ActionResult> {
  try {
    const port = await getPoPort();
    const orders = await port.loadOrders();
    const order = orders.find((o) => o.id === input.orderId);
    if (!order) return { ok: false, message: 'Pedido não encontrado.' };
    if (!canCancel(order.status)) {
      return {
        ok: false,
        message:
          order.status === 'received'
            ? 'Pedido já recebido não se cancela. Devolução é outro ato (ainda não construído).'
            : 'Este pedido não pode ser cancelado.',
      };
    }
    await port.updateStatus({ orderId: input.orderId, status: 'cancelled' });
    revalidatePath('/compras');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function receiveOrderLine(input: {
  orderId: string;
  lineNo: number;
  qtyReceived: number;
}): Promise<ActionResult> {
  try {
    const port = await getPoPort();
    const orders = await port.loadOrders();
    const order = orders.find((o) => o.id === input.orderId);
    if (!order) return { ok: false, message: 'Pedido não encontrado.' };
    if (!canReceive(order.status)) {
      return { ok: false, message: 'Só pedidos enviados (ou parciais) recebem mercadoria.' };
    }
    if (!(input.qtyReceived >= 0) || !Number.isFinite(input.qtyReceived)) {
      return { ok: false, message: 'Quantidade recebida inválida.' };
    }
    await port.receiveLine(input);
    revalidatePath('/compras');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function changeOrderStatus(input: {
  orderId: string;
  to: OrderStatus;
}): Promise<ActionResult> {
  if (input.to === 'cancelled') return cancelOrder({ orderId: input.orderId });
  if (input.to === 'submitted') return submitOrder({ orderId: input.orderId });
  return { ok: false, message: 'Use o fluxo de recebimento para avançar o status.' };
}
