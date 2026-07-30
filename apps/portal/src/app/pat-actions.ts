'use server';

import { revalidatePath } from 'next/cache';

import { validateNewAsset, whyCannotTransfer, whyCannotWriteOff } from '@alsham/assets';

import { getPatPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createAsset(input: {
  name: string;
  code: string;
  description: string;
  categoryId: string | null;
  originalLocation: string;
  acquisitionCostCents: number | null;
  currency: string | null;
  acquiredOn: string | null;
}): Promise<ActionResult<{ assetId: string }>> {
  // ⭐ A validação — inclusive "aquisição não mora no futuro" — é do PACOTE.
  const hoje = new Date().toISOString().slice(0, 10);
  const r = validateNewAsset(input, hoje);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }

  try {
    const port = await getPatPort();
    const { assetId } = await port.createAsset({
      name: r.value.name,
      code: r.value.code,
      description: r.value.description,
      categoryId: input.categoryId,
      originalLocation: r.value.originalLocation,
      acquisitionCostCents: r.value.acquisitionCostCents,
      currency: r.value.currency,
      acquiredOn: r.value.acquiredOn,
    });
    revalidatePath('/patrimonio');
    return { ok: true, data: { assetId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function transferAsset(input: {
  assetId: string;
  toLocation: string;
  note: string;
}): Promise<ActionResult> {
  try {
    const port = await getPatPort();
    const assets = await port.loadAssets();
    const a = assets.find((x) => x.id === input.assetId);
    if (!a) return { ok: false, message: 'Bem não encontrado.' };
    // ⭐ A recusa com nome é do PACOTE.
    const porQueNao = whyCannotTransfer(a, input.toLocation);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.transferAsset({
      assetId: input.assetId,
      toLocation: input.toLocation.trim(),
      note: input.note.trim(),
    });
    revalidatePath('/patrimonio');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function writeOffAsset(input: {
  assetId: string;
  reason: string;
}): Promise<ActionResult> {
  try {
    const port = await getPatPort();
    const assets = await port.loadAssets();
    const a = assets.find((x) => x.id === input.assetId);
    if (!a) return { ok: false, message: 'Bem não encontrado.' };
    const porQueNao = whyCannotWriteOff(a, input.reason);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.writeOffAsset({ assetId: input.assetId, reason: input.reason.trim() });
    revalidatePath('/patrimonio');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function createPatCategory(input: { name: string }): Promise<ActionResult> {
  if (input.name.trim().length === 0) {
    return { ok: false, message: 'A categoria precisa de um nome.' };
  }
  try {
    const port = await getPatPort();
    await port.createCategory({ name: input.name.trim() });
    revalidatePath('/patrimonio');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
