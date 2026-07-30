'use server';

import { revalidatePath } from 'next/cache';

import {
  canCancel,
  canReopen,
  canStart,
  canTransition,
  validateNewOrder,
  whyCannotComplete,
} from '@alsham/maintenance';

import { getMntPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createOrder(input: {
  title: string;
  description: string;
  kind: 'corrective' | 'preventive';
  target: string;
  priorityId: string | null;
  recurrenceDays: number | null;
}): Promise<ActionResult<{ orderId: string }>> {
  // ⭐ A validação — inclusive "recorrência é da preventiva" — é do PACOTE.
  const r = validateNewOrder(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }

  try {
    const port = await getMntPort();
    const { orderId } = await port.createOrder({
      title: r.value.title,
      description: r.value.description,
      kind: r.value.kind,
      target: r.value.target,
      priorityId: input.priorityId,
      recurrenceDays: r.value.recurrenceDays,
    });
    revalidatePath('/manutencao');
    return { ok: true, data: { orderId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function moveOrder(input: {
  orderId: string;
  to: 'open' | 'in_progress' | 'cancelled';
}): Promise<ActionResult> {
  try {
    const port = await getMntPort();
    const orders = await port.loadOrders();
    const o = orders.find((x) => x.id === input.orderId);
    if (!o) return { ok: false, message: 'Ordem não encontrada.' };

    const pode =
      input.to === 'in_progress'
        ? canStart(o.status) || canReopen(o.status)
        : input.to === 'cancelled'
          ? canCancel(o.status)
          : canTransition(o.status, 'open');
    if (!pode) {
      return { ok: false, message: `A ordem não vai de ${o.status} para ${input.to}.` };
    }

    await port.setStatus({ orderId: input.orderId, status: input.to });
    revalidatePath('/manutencao');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function completeOrder(input: {
  orderId: string;
  completionNote: string;
  costCents: number | null;
  currency: string | null;
}): Promise<ActionResult> {
  try {
    const port = await getMntPort();
    const orders = await port.loadOrders();
    const o = orders.find((x) => x.id === input.orderId);
    if (!o) return { ok: false, message: 'Ordem não encontrada.' };
    // ⭐ A recusa com nome é do PACOTE.
    const porQueNao = whyCannotComplete(o, input.completionNote);
    if (porQueNao !== null) return { ok: false, message: porQueNao };
    if ((input.costCents === null) !== (input.currency === null)) {
      return { ok: false, message: 'Custo e moeda andam juntos — informe os dois ou nenhum.' };
    }
    await port.setStatus({
      orderId: input.orderId,
      status: 'done',
      completionNote: input.completionNote.trim(),
      costCents: input.costCents,
      currency: input.currency,
    });
    revalidatePath('/manutencao');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function createPriority(input: {
  name: string;
  position: number;
}): Promise<ActionResult> {
  if (input.name.trim().length === 0) {
    return { ok: false, message: 'A prioridade precisa de um nome.' };
  }
  try {
    const port = await getMntPort();
    await port.createPriority({ name: input.name.trim(), position: input.position });
    revalidatePath('/manutencao');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
