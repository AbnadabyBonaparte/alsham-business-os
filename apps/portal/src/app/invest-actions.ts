'use server';

import { revalidatePath } from 'next/cache';

import { validateMovement, validateNewHolding } from '@alsham/investments';

import { getInvestPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createHolding(input: {
  name: string;
  kind: string;
  institution: string;
  currency: string;
}): Promise<ActionResult<{ holdingId: string }>> {
  const v = validateNewHolding(input);
  if (!v.ok) return { ok: false, message: v.problems.map((p) => p.message).join(' ') };
  try {
    const port = await getInvestPort();
    const { holdingId } = await port.createHolding(v.value);
    revalidatePath('/investimentos');
    return { ok: true, data: { holdingId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function setHoldingStatus(input: {
  holdingId: string;
  status: 'active' | 'archived';
}): Promise<ActionResult> {
  try {
    const port = await getInvestPort();
    await port.setHoldingStatus(input);
    revalidatePath('/investimentos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function registerMovement(input: {
  holdingId: string;
  kind: 'application' | 'yield' | 'redemption';
  amount: string;
  currency: string;
  note: string;
  occurredOn: string;
}): Promise<ActionResult> {
  const amountCents = Math.round(Number(input.amount.replace(',', '.')) * 100);
  const v = validateMovement({ kind: input.kind, amountCents, currency: input.currency, occurredOn: input.occurredOn });
  if (!v.ok) return { ok: false, message: v.problems.map((p) => p.message).join(' ') };
  try {
    const port = await getInvestPort();
    await port.registerMovement({
      holdingId: input.holdingId,
      kind: v.value.kind,
      amountCents: v.value.amountCents,
      currency: v.value.currency,
      note: input.note.trim(),
      occurredOn: v.value.occurredOn,
    });
    revalidatePath('/investimentos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
