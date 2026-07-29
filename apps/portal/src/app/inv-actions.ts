'use server';

import { revalidatePath } from 'next/cache';

import {
  canTransition,
  permissionForMovement,
  validateNewItem,
  validateNewMovement,
} from '@alsham/inventory';
import type { ItemStatus, NewItem, NewMovement } from '@alsham/inventory';

import { getInvPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

/**
 * As ações do Módulo 8. Zero decisão aqui: quem valida é o pacote
 * (`validateNewItem`, `validateNewMovement`, `canTransition`), quem grava é
 * o banco — e a permissão do ajuste é conferida pela policy, não por um `if`
 * de tela. `permissionForMovement()` entra só para a MENSAGEM ser honesta.
 */

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function registerItem(input: NewItem): Promise<ActionResult<{ itemId: string }>> {
  const erro = validateNewItem(input);
  if (erro !== null) return { ok: false, message: erro };

  try {
    const port = await getInvPort();
    const { itemId } = await port.createItem(input);
    revalidatePath('/estoque');
    return { ok: true, data: { itemId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function editItem(input: {
  itemId: string;
  description: string;
  unit: string;
  sku: string | null;
}): Promise<ActionResult> {
  const erro = validateNewItem({ description: input.description, unit: input.unit, sku: input.sku });
  if (erro !== null) return { ok: false, message: erro };

  try {
    const port = await getInvPort();
    await port.updateItem(input);
    revalidatePath('/estoque');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function changeItemStatus(input: {
  itemId: string;
  to: ItemStatus;
}): Promise<ActionResult> {
  try {
    const port = await getInvPort();
    const items = await port.loadItems();
    const item = items.find((i) => i.id === input.itemId);
    if (!item) return { ok: false, message: 'Item não encontrado.' };
    if (!canTransition(item.status, input.to)) {
      return { ok: false, message: 'Esta mudança de estado não existe no ciclo de vida do item.' };
    }
    await port.updateItemStatus({ itemId: input.itemId, status: input.to });
    revalidatePath('/estoque');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function registerMovement(
  input: NewMovement,
): Promise<ActionResult<{ movementId: string }>> {
  const erro = validateNewMovement(input);
  if (erro !== null) return { ok: false, message: erro };

  try {
    const port = await getInvPort();
    const permissions = await port.listPermissions();
    const exigida = permissionForMovement(input.kind);
    if (!permissions.has(exigida)) {
      // A policy do banco recusaria do mesmo jeito; aqui a recusa ganha
      // frase com o NOME da permissão, em vez de um erro de RLS.
      return { ok: false, message: `Este movimento exige a permissão ${exigida}.` };
    }
    const { movementId } = await port.registerMovement(input);
    revalidatePath('/estoque');
    return { ok: true, data: { movementId } };
  } catch (err) {
    return toResult(err);
  }
}
