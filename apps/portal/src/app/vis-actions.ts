'use server';

import { revalidatePath } from 'next/cache';

import {
  canCheckIn,
  canMarkNoShow,
  validateNewVisit,
  whyCannotCancel,
  whyCannotCheckOut,
} from '@alsham/visits';

import { getVisPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createVisit(input: {
  visitorName: string;
  visitorDocument: string;
  visitorContact: string;
  host: string;
  reason: string;
  scheduled: boolean;
  expectedAt: string | null;
  correctsVisitId?: string | null;
}): Promise<ActionResult<{ visitId: string }>> {
  // ⭐ A validação — inclusive "agendar exige o quando" — é do PACOTE.
  const r = validateNewVisit(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }

  try {
    const port = await getVisPort();
    const { visitId } = await port.createVisit({
      visitorName: r.value.visitorName,
      visitorDocument: r.value.visitorDocument,
      visitorContact: r.value.visitorContact,
      host: r.value.host,
      reason: r.value.reason,
      scheduled: r.value.status === 'scheduled',
      expectedAt: r.value.expectedAt,
      correctsVisitId: input.correctsVisitId ?? null,
    });
    revalidatePath('/visitas');
    return { ok: true, data: { visitId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function checkInVisit(input: { visitId: string }): Promise<ActionResult> {
  try {
    const port = await getVisPort();
    const visits = await port.loadVisits();
    const v = visits.find((x) => x.id === input.visitId);
    if (!v) return { ok: false, message: 'Visita não encontrada.' };
    if (!canCheckIn(v.status)) {
      return { ok: false, message: 'Só o agendado faz check-in — o walk-in já entra entrando.' };
    }
    await port.setStatus({ visitId: input.visitId, status: 'checked_in' });
    revalidatePath('/visitas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function checkOutVisit(input: { visitId: string }): Promise<ActionResult> {
  try {
    const port = await getVisPort();
    const visits = await port.loadVisits();
    const v = visits.find((x) => x.id === input.visitId);
    if (!v) return { ok: false, message: 'Visita não encontrada.' };
    // ⭐ A recusa com nome é do PACOTE.
    const porQueNao = whyCannotCheckOut(v);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.setStatus({ visitId: input.visitId, status: 'checked_out' });
    revalidatePath('/visitas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function markNoShow(input: { visitId: string }): Promise<ActionResult> {
  try {
    const port = await getVisPort();
    const visits = await port.loadVisits();
    const v = visits.find((x) => x.id === input.visitId);
    if (!v) return { ok: false, message: 'Visita não encontrada.' };
    if (!canMarkNoShow(v.status)) {
      return { ok: false, message: 'Só o agendado pode não vir.' };
    }
    await port.setStatus({ visitId: input.visitId, status: 'no_show' });
    revalidatePath('/visitas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function cancelVisit(input: {
  visitId: string;
  reason: string;
}): Promise<ActionResult> {
  try {
    const port = await getVisPort();
    const visits = await port.loadVisits();
    const v = visits.find((x) => x.id === input.visitId);
    if (!v) return { ok: false, message: 'Visita não encontrada.' };
    const porQueNao = whyCannotCancel(v, input.reason);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.setStatus({
      visitId: input.visitId,
      status: 'cancelled',
      cancelReason: input.reason.trim(),
    });
    revalidatePath('/visitas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
