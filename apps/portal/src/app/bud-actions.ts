'use server';

import { revalidatePath } from 'next/cache';

import { canActivate, canClose, validateNewBudget } from '@alsham/budgets';

import { getBudPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createBudget(input: {
  name: string;
  category: string;
  startsOn: string;
  endsOn: string;
  limit: string;
  currency: string;
}): Promise<ActionResult<{ budgetId: string }>> {
  const limitCents = Math.round(Number(input.limit.replace(',', '.')) * 100);
  // ⭐ A validação é do PACOTE (período coerente, teto positivo, valor+moeda).
  const v = validateNewBudget({
    name: input.name,
    category: input.category,
    startsOn: input.startsOn,
    endsOn: input.endsOn,
    limitCents,
    currency: input.currency,
  });
  if (!v.ok) return { ok: false, message: v.problems.map((p) => p.message).join(' ') };
  try {
    const port = await getBudPort();
    const { budgetId } = await port.createBudget(v.value);
    revalidatePath('/orcamentos');
    return { ok: true, data: { budgetId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function renameBudget(input: { budgetId: string; name: string }): Promise<ActionResult> {
  if (input.name.trim().length === 0) return { ok: false, message: 'Dê um nome ao orçamento.' };
  try {
    const port = await getBudPort();
    await port.renameBudget({ budgetId: input.budgetId, name: input.name.trim() });
    revalidatePath('/orcamentos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function activateBudget(input: { budgetId: string; status: 'draft' | 'active' | 'closed' }): Promise<ActionResult> {
  // ⭐ A decisão de vida do orçamento é do PACOTE.
  if (!canActivate(input.status)) return { ok: false, message: 'Só o rascunho ativa — a trave vai congelar.' };
  try {
    const port = await getBudPort();
    await port.setBudgetStatus({ budgetId: input.budgetId, status: 'active' });
    revalidatePath('/orcamentos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function closeBudget(input: { budgetId: string; status: 'draft' | 'active' | 'closed' }): Promise<ActionResult> {
  if (!canClose(input.status)) return { ok: false, message: 'Só o orçamento ativo fecha o período.' };
  try {
    const port = await getBudPort();
    await port.setBudgetStatus({ budgetId: input.budgetId, status: 'closed' });
    revalidatePath('/orcamentos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
