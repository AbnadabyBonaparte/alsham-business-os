'use server';

import { revalidatePath } from 'next/cache';

import { validateMovement, validateNewAccount, validateTransfer } from '@alsham/bank-accounts';

import { getBankPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function createAccount(input: {
  name: string;
  bankName: string;
  branch: string;
  accountNumber: string;
  currency: string;
}): Promise<ActionResult<{ accountId: string }>> {
  const v = validateNewAccount(input);
  if (!v.ok) return { ok: false, message: v.problems.map((p) => p.message).join(' ') };
  try {
    const port = await getBankPort();
    const { accountId } = await port.createAccount(v.value);
    revalidatePath('/contas-bancarias');
    return { ok: true, data: { accountId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function setAccountStatus(input: {
  accountId: string;
  status: 'active' | 'archived';
}): Promise<ActionResult> {
  try {
    const port = await getBankPort();
    await port.setAccountStatus(input);
    revalidatePath('/contas-bancarias');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function registerMovement(input: {
  accountId: string;
  kind: 'in' | 'out' | 'adjustment';
  amount: string;
  currency: string;
  description: string;
  reason: string;
  occurredOn: string;
}): Promise<ActionResult> {
  const amountCents = Math.round(Number(input.amount.replace(',', '.')) * 100);
  const v = validateMovement({
    kind: input.kind,
    amountCents,
    currency: input.currency,
    occurredOn: input.occurredOn,
    reason: input.reason,
  });
  if (!v.ok) return { ok: false, message: v.problems.map((p) => p.message).join(' ') };
  try {
    const port = await getBankPort();
    await port.registerMovement({
      accountId: input.accountId,
      kind: v.value.kind,
      amountCents: v.value.amountCents,
      currency: v.value.currency,
      description: input.description.trim(),
      reason: v.value.reason,
      occurredOn: v.value.occurredOn,
    });
    revalidatePath('/contas-bancarias');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function transfer(input: {
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  occurredOn: string;
  description: string;
}): Promise<ActionResult> {
  const amountCents = Math.round(Number(input.amount.replace(',', '.')) * 100);
  const v = validateTransfer(
    { fromAccountId: input.fromAccountId, toAccountId: input.toAccountId, amountCents, occurredOn: input.occurredOn },
    today(),
  );
  if (!v.ok) return { ok: false, message: v.problems.map((p) => p.message).join(' ') };
  try {
    const port = await getBankPort();
    await port.transfer({ ...v.value, description: input.description.trim() });
    revalidatePath('/contas-bancarias');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
