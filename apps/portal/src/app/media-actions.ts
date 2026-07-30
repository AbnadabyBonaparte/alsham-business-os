'use server';

import { revalidatePath } from 'next/cache';

import { canArchive, canRestore, validateNewAsset, whyCannotRecordUsage } from '@alsham/media';

import { getMediaPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createAsset(input: {
  title: string;
  description: string;
  assetType: string;
  location: string;
}): Promise<ActionResult<{ assetId: string }>> {
  // ⭐ A validação é do PACOTE — a tela consome, nunca decide.
  const r = validateNewAsset(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }
  try {
    const port = await getMediaPort();
    const { assetId } = await port.createAsset(r.value);
    revalidatePath('/midia');
    return { ok: true, data: { assetId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function updateAsset(input: {
  assetId: string;
  title: string;
  description: string;
  assetType: string;
  location: string;
}): Promise<ActionResult> {
  const r = validateNewAsset(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }
  try {
    const port = await getMediaPort();
    await port.updateAsset({ assetId: input.assetId, ...r.value });
    revalidatePath('/midia');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function setAssetStatus(input: {
  assetId: string;
  status: 'active' | 'archived';
}): Promise<ActionResult> {
  try {
    const port = await getMediaPort();
    const assets = await port.loadAssets();
    const a = assets.find((x) => x.id === input.assetId);
    if (!a) return { ok: false, message: 'Obra não encontrada.' };
    const pode = input.status === 'archived' ? canArchive(a.status) : canRestore(a.status);
    if (!pode) return { ok: false, message: 'A obra já está aí.' };
    await port.setAssetStatus(input);
    revalidatePath('/midia');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function createTag(input: { name: string }): Promise<ActionResult<{ tagId: string }>> {
  if (input.name.trim().length === 0) {
    return { ok: false, message: 'Dê um nome à etiqueta.' };
  }
  try {
    const port = await getMediaPort();
    const { tagId } = await port.createTag({ name: input.name.trim() });
    revalidatePath('/midia');
    return { ok: true, data: { tagId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function tagAsset(input: { assetId: string; tagId: string }): Promise<ActionResult> {
  try {
    const port = await getMediaPort();
    await port.tagAsset(input);
    revalidatePath('/midia');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function untagAsset(input: { assetId: string; tagId: string }): Promise<ActionResult> {
  try {
    const port = await getMediaPort();
    await port.untagAsset(input);
    revalidatePath('/midia');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function recordUsage(input: {
  assetId: string;
  usedIn: string;
  note: string;
}): Promise<ActionResult> {
  try {
    const port = await getMediaPort();
    const assets = await port.loadAssets();
    const a = assets.find((x) => x.id === input.assetId);
    if (!a) return { ok: false, message: 'Obra não encontrada.' };
    // ⭐ A recusa com nome é do PACOTE — e o banco confere de novo.
    const porQueNao = whyCannotRecordUsage(a, input.usedIn);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.recordUsage({ assetId: input.assetId, usedIn: input.usedIn.trim(), note: input.note.trim() });
    revalidatePath('/midia');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
