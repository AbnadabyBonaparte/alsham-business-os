'use server';

import { revalidatePath } from 'next/cache';

import { canReschedule, validateNewPiece, whyCannotClose, whyCannotMove, whyCannotPlanOn } from '@alsham/editorial';

import { getEdcalPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createChannel(input: { name: string }): Promise<ActionResult<{ channelId: string }>> {
  if (input.name.trim().length === 0) {
    return { ok: false, message: 'Dê um nome ao canal.' };
  }
  try {
    const port = await getEdcalPort();
    const { channelId } = await port.createChannel({ name: input.name.trim() });
    revalidatePath('/calendario');
    return { ok: true, data: { channelId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function setChannelStatus(input: {
  channelId: string;
  status: 'active' | 'archived';
}): Promise<ActionResult> {
  try {
    const port = await getEdcalPort();
    await port.setChannelStatus(input);
    revalidatePath('/calendario');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function createStage(input: { name: string }): Promise<ActionResult<{ stageId: string }>> {
  if (input.name.trim().length === 0) {
    return { ok: false, message: 'Dê um nome à etapa.' };
  }
  try {
    const port = await getEdcalPort();
    const stages = await port.loadStages();
    const position = stages.reduce((m, s) => Math.max(m, s.position), -1) + 1;
    const { stageId } = await port.createStage({ name: input.name.trim(), position });
    revalidatePath('/calendario');
    return { ok: true, data: { stageId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function removeStage(input: { stageId: string }): Promise<ActionResult> {
  try {
    const port = await getEdcalPort();
    await port.removeStage(input);
    revalidatePath('/calendario');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function createPiece(input: {
  title: string;
  brief: string;
  channelId: string;
  stageId: string;
  plannedOn: string;
}): Promise<ActionResult<{ pieceId: string }>> {
  // ⭐ A validação é do PACOTE — a tela consome, nunca decide.
  const r = validateNewPiece(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }
  try {
    const port = await getEdcalPort();
    const channels = await port.loadChannels();
    const canal = channels.find((c) => c.id === r.value.channelId);
    if (!canal) return { ok: false, message: 'Canal não encontrado.' };
    // ⭐ A recusa com nome é do PACOTE — e o banco confere de novo.
    const porQueNao = whyCannotPlanOn(canal);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    const { pieceId } = await port.createPiece(r.value);
    revalidatePath('/calendario');
    return { ok: true, data: { pieceId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function updatePlan(input: {
  pieceId: string;
  title: string;
  brief: string;
  plannedOn: string;
}): Promise<ActionResult> {
  try {
    const port = await getEdcalPort();
    const pieces = await port.loadPieces();
    const p = pieces.find((x) => x.id === input.pieceId);
    if (!p) return { ok: false, message: 'Pauta não encontrada.' };
    if (!canReschedule(p.status)) {
      return { ok: false, message: 'O fim da pauta é registro de fato: não se reescreve.' };
    }
    if (input.title.trim().length === 0) {
      return { ok: false, message: 'Dê um título à pauta.' };
    }
    await port.updatePlan({
      pieceId: input.pieceId,
      title: input.title.trim(),
      brief: input.brief,
      plannedOn: input.plannedOn,
    });
    revalidatePath('/calendario');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function movePiece(input: {
  pieceId: string;
  toStageId: string;
  note: string;
}): Promise<ActionResult> {
  try {
    const port = await getEdcalPort();
    const pieces = await port.loadPieces();
    const p = pieces.find((x) => x.id === input.pieceId);
    if (!p) return { ok: false, message: 'Pauta não encontrada.' };
    // ⭐ A recusa com nome é do PACOTE.
    const porQueNao = whyCannotMove(p, input.toStageId);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.movePiece({ pieceId: input.pieceId, toStageId: input.toStageId, note: input.note.trim() });
    revalidatePath('/calendario');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function closePiece(input: {
  pieceId: string;
  outcome: 'published' | 'dropped';
  reason: string;
}): Promise<ActionResult> {
  try {
    const port = await getEdcalPort();
    const pieces = await port.loadPieces();
    const p = pieces.find((x) => x.id === input.pieceId);
    if (!p) return { ok: false, message: 'Pauta não encontrada.' };
    // ⭐ A recusa com nome é do PACOTE.
    const porQueNao = whyCannotClose(p, input.outcome, input.reason);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.closePiece({ pieceId: input.pieceId, outcome: input.outcome, reason: input.reason.trim() });
    revalidatePath('/calendario');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
