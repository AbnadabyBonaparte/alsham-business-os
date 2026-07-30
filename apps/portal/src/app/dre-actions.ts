'use server';

import { revalidatePath } from 'next/cache';

import { validateNewLine } from '@alsham/dre';

import { getDrePort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createLine(input: {
  name: string;
  kind: 'revenue' | 'cost' | 'expense';
  matchCategory: string;
  position: number;
  currency: string;
}): Promise<ActionResult<{ lineId: string }>> {
  const v = validateNewLine(input);
  if (!v.ok) return { ok: false, message: v.problems.map((p) => p.message).join(' ') };
  try {
    const port = await getDrePort();
    const { lineId } = await port.createLine(v.value);
    revalidatePath('/dre');
    return { ok: true, data: { lineId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function setLineStatus(input: {
  lineId: string;
  status: 'active' | 'archived';
}): Promise<ActionResult> {
  try {
    const port = await getDrePort();
    await port.setLineStatus(input);
    revalidatePath('/dre');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
