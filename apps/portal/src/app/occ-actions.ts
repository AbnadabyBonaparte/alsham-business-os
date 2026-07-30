'use server';

import { revalidatePath } from 'next/cache';

import {
  canTreat,
  validateNewOccurrence,
  validateTreatment,
  whyCannotClose,
} from '@alsham/occurrences';

import { getOccPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function registerOccurrence(input: {
  title: string;
  description: string;
  location: string;
  involved: string;
  severityId: string | null;
  occurredAt: string;
}): Promise<ActionResult<{ occurrenceId: string }>> {
  // ⭐ A validação — inclusive a recusa do FUTURO — é do PACOTE.
  const r = validateNewOccurrence(input, new Date().toISOString());
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }

  try {
    const port = await getOccPort();
    const { occurrenceId } = await port.registerOccurrence({
      title: r.value.title,
      description: r.value.description,
      location: r.value.location,
      involved: r.value.involved,
      severityId: input.severityId,
      occurredAt: r.value.occurredAt,
    });
    revalidatePath('/ocorrencias');
    return { ok: true, data: { occurrenceId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function recordTreatment(input: {
  occurrenceId: string;
  actionTaken: string;
}): Promise<ActionResult> {
  const r = validateTreatment(input.actionTaken);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }
  try {
    const port = await getOccPort();
    const occurrences = await port.loadOccurrences();
    const o = occurrences.find((x) => x.id === input.occurrenceId);
    if (!o) return { ok: false, message: 'Ocorrência não encontrada.' };
    if (!canTreat(o.status)) {
      return {
        ok: false,
        message: 'Ocorrência encerrada não recebe tratativa — o que acontecer de novo é ocorrência nova.',
      };
    }
    await port.recordTreatment({ occurrenceId: input.occurrenceId, actionTaken: r.value.actionTaken });
    revalidatePath('/ocorrencias');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function closeOccurrence(input: {
  occurrenceId: string;
  outcome: string;
}): Promise<ActionResult> {
  try {
    const port = await getOccPort();
    const occurrences = await port.loadOccurrences();
    const o = occurrences.find((x) => x.id === input.occurrenceId);
    if (!o) return { ok: false, message: 'Ocorrência não encontrada.' };
    // ⭐ A recusa com nome é do PACOTE.
    const porQueNao = whyCannotClose(o, input.outcome);
    if (porQueNao !== null) return { ok: false, message: porQueNao };
    await port.closeOccurrence({ occurrenceId: input.occurrenceId, outcome: input.outcome.trim() });
    revalidatePath('/ocorrencias');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function createSeverity(input: {
  name: string;
  position: number;
}): Promise<ActionResult> {
  if (input.name.trim().length === 0) {
    return { ok: false, message: 'A gravidade precisa de um nome.' };
  }
  try {
    const port = await getOccPort();
    await port.createSeverity({ name: input.name.trim(), position: input.position });
    revalidatePath('/ocorrencias');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
