'use server';

import { revalidatePath } from 'next/cache';

import {
  validateNewTemplate,
  whyCannotAbandon,
  whyCannotAnswer,
  whyCannotComplete,
  whyCannotStart,
} from '@alsham/checklists';

import { getChkPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createTemplate(input: {
  name: string;
  items: readonly string[];
}): Promise<ActionResult> {
  // ⭐ A validação — "prancheta vazia não é inspeção" — é do PACOTE.
  const r = validateNewTemplate(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }
  try {
    const port = await getChkPort();
    await port.createTemplate({ name: r.value.name, items: r.value.items });
    revalidatePath('/checklists');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function startRun(input: {
  templateId: string;
  subject: string;
}): Promise<ActionResult<{ runId: string }>> {
  try {
    const port = await getChkPort();
    const [templates, items] = await Promise.all([port.loadTemplates(), port.loadTemplateItems()]);
    const t = templates.find((x) => x.id === input.templateId);
    const ativos = items.filter(
      (i) => i.templateId === input.templateId && i.status === 'active',
    ).length;
    // ⭐ A recusa com nome é do PACOTE.
    const porQueNao = whyCannotStart(t, ativos);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    const { runId } = await port.startRun({
      templateId: input.templateId,
      subject: input.subject.trim(),
    });
    revalidatePath('/checklists');
    return { ok: true, data: { runId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function answerItem(input: {
  runId: string;
  itemId: string;
  answer: 'ok' | 'not_ok' | 'not_applicable';
  note: string;
}): Promise<ActionResult> {
  try {
    const port = await getChkPort();
    const [runs, items] = await Promise.all([port.loadRuns(), port.loadRunItems()]);
    const run = runs.find((r) => r.id === input.runId);
    const item = items.find((i) => i.id === input.itemId);
    if (!run || !item) return { ok: false, message: 'Execução ou item não encontrado.' };
    const porQueNao = whyCannotAnswer(run, item);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.answerItem({ itemId: input.itemId, answer: input.answer, note: input.note.trim() });
    revalidatePath('/checklists');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function completeRun(input: { runId: string }): Promise<ActionResult> {
  try {
    const port = await getChkPort();
    const [runs, items] = await Promise.all([port.loadRuns(), port.loadRunItems()]);
    const run = runs.find((r) => r.id === input.runId);
    if (!run) return { ok: false, message: 'Execução não encontrada.' };
    const porQueNao = whyCannotComplete(run, items);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.setRunStatus({ runId: input.runId, status: 'completed' });
    revalidatePath('/checklists');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function abandonRun(input: {
  runId: string;
  reason: string;
}): Promise<ActionResult> {
  try {
    const port = await getChkPort();
    const runs = await port.loadRuns();
    const run = runs.find((r) => r.id === input.runId);
    if (!run) return { ok: false, message: 'Execução não encontrada.' };
    const porQueNao = whyCannotAbandon(run, input.reason);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.setRunStatus({
      runId: input.runId,
      status: 'abandoned',
      abandonReason: input.reason.trim(),
    });
    revalidatePath('/checklists');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
