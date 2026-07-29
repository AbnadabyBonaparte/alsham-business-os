'use server';

import { revalidatePath } from 'next/cache';

import { validateNewCategory, validateNewEntry } from '@alsham/cashflow';
import type { EntryKind } from '@alsham/cashflow';

import { getCashPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

const hoje = () => new Date().toISOString().slice(0, 10);

export async function createEntry(input: {
  kind: EntryKind;
  amountCents: number;
  currency: string;
  description: string;
  reason: string;
  categoryId: string | null;
  account: string;
  occurredOn: string;
}): Promise<ActionResult<{ entryId: string }>> {
  // ⭐ A validação — inclusive a recusa do FUTURO — é do PACOTE.
  const r = validateNewEntry(input, hoje());
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }

  try {
    const port = await getCashPort();
    const { entryId } = await port.createEntry({
      kind: r.value.kind,
      amountCents: r.value.amountCents,
      currency: r.value.currency,
      description: r.value.description,
      reason: r.value.reason,
      categoryId: input.categoryId,
      account: r.value.account,
      occurredOn: r.value.occurredOn,
    });
    revalidatePath('/caixa');
    return { ok: true, data: { entryId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function createCategory(input: { name: string }): Promise<ActionResult<{ categoryId: string }>> {
  const r = validateNewCategory(input.name);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }
  try {
    const port = await getCashPort();
    const { categoryId } = await port.createCategory({ name: r.value.name });
    revalidatePath('/caixa');
    return { ok: true, data: { categoryId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function setCategoryStatus(input: {
  categoryId: string;
  status: 'active' | 'archived';
}): Promise<ActionResult> {
  try {
    const port = await getCashPort();
    await port.setCategoryStatus(input);
    revalidatePath('/caixa');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
