'use server';

import { revalidatePath } from 'next/cache';

import { validateNewReservation, whyCannotBook, whyCannotCancel } from '@alsham/spaces';

import { getSpcPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function bookReservation(input: {
  spaceId: string;
  purpose: string;
  startsAt: string;
  endsAt: string;
}): Promise<ActionResult<{ reservationId: string }>> {
  // ⭐ A validação (período; o passado é permitido) é do PACOTE.
  const r = validateNewReservation(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }

  try {
    const port = await getSpcPort();
    const [spaces, existing] = await Promise.all([port.loadSpaces(), port.loadReservations()]);
    const space = spaces.find((s) => s.id === r.value.spaceId);
    // ⭐ A recusa com nome ANTES da constraint — a mesma régua meio-aberta.
    const porQueNao = whyCannotBook(space, r.value.startsAt, r.value.endsAt, existing);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    const { reservationId } = await port.bookReservation({
      spaceId: r.value.spaceId,
      purpose: r.value.purpose,
      startsAt: r.value.startsAt,
      endsAt: r.value.endsAt,
    });
    revalidatePath('/espacos');
    return { ok: true, data: { reservationId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function cancelReservation(input: {
  reservationId: string;
  reason: string;
}): Promise<ActionResult> {
  try {
    const port = await getSpcPort();
    const reservations = await port.loadReservations();
    const r = reservations.find((x) => x.id === input.reservationId);
    if (!r) return { ok: false, message: 'Reserva não encontrada.' };
    const porQueNao = whyCannotCancel(r, input.reason);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.cancelReservation({
      reservationId: input.reservationId,
      reason: input.reason.trim(),
    });
    revalidatePath('/espacos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function createSpace(input: {
  name: string;
  description: string;
  capacity: number | null;
}): Promise<ActionResult> {
  if (input.name.trim().length === 0) {
    return { ok: false, message: 'O espaço precisa de um nome.' };
  }
  if (input.capacity !== null && (!Number.isInteger(input.capacity) || input.capacity <= 0)) {
    return { ok: false, message: 'Capacidade em número inteiro maior que zero — ou vazia.' };
  }
  try {
    const port = await getSpcPort();
    await port.createSpace({
      name: input.name.trim(),
      description: input.description.trim(),
      capacity: input.capacity,
    });
    revalidatePath('/espacos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function setSpaceStatus(input: {
  spaceId: string;
  status: 'active' | 'archived';
}): Promise<ActionResult> {
  try {
    const port = await getSpcPort();
    await port.setSpaceStatus(input);
    revalidatePath('/espacos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
