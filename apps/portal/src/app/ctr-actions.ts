'use server';

import { revalidatePath } from 'next/cache';

import {
  canActivate,
  canAdjust,
  canCancel,
  canEnd,
  validateNewContract,
  whyCannotRenewTo,
  whyCannotTerminate,
} from '@alsham/contracts';

import { getCtrPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

const hoje = () => new Date().toISOString().slice(0, 10);

export async function createContract(input: {
  externalRef: string;
  title: string;
  description: string;
  contractType: string;
  counterpartyName: string;
  counterpartyTaxId: string;
  startsOn: string;
  endsOn: string;
  valueCents: number | null;
  currency: string;
}): Promise<ActionResult<{ contractId: string }>> {
  // ⭐ A validação é do PACOTE — a tela não decide (Regra de Ouro).
  const r = validateNewContract(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }

  try {
    const port = await getCtrPort();
    const { contractId } = await port.createContract({
      externalRef: r.value.externalRef,
      title: r.value.title,
      description: r.value.description,
      contractType: r.value.contractType,
      counterpartyName: r.value.counterpartyName,
      counterpartyTaxId: r.value.counterpartyTaxId,
      startsOn: r.value.startsOn,
      endsOn: r.value.endsOn,
      valueCents: r.value.valueCents,
      currency: r.value.currency,
    });
    revalidatePath('/contratos');
    return { ok: true, data: { contractId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function activateContract(input: { contractId: string }): Promise<ActionResult> {
  try {
    const port = await getCtrPort();
    const contracts = await port.loadContracts();
    const c = contracts.find((x) => x.id === input.contractId);
    if (!c) return { ok: false, message: 'Contrato não encontrado.' };
    if (!canActivate(c)) {
      return {
        ok: false,
        message: 'Entrar em vigor exige contraparte e início de vigência — complete o rascunho.',
      };
    }
    await port.setStatus({ contractId: input.contractId, status: 'active' });
    revalidatePath('/contratos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function cancelContract(input: { contractId: string }): Promise<ActionResult> {
  try {
    const port = await getCtrPort();
    const contracts = await port.loadContracts();
    const c = contracts.find((x) => x.id === input.contractId);
    if (!c) return { ok: false, message: 'Contrato não encontrado.' };
    if (!canCancel(c)) {
      return { ok: false, message: 'Só rascunho se cancela — contrato em vigor rescinde-se.' };
    }
    await port.setStatus({ contractId: input.contractId, status: 'cancelled' });
    revalidatePath('/contratos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function endContract(input: { contractId: string }): Promise<ActionResult> {
  try {
    const port = await getCtrPort();
    const [contracts, renewals] = await Promise.all([port.loadContracts(), port.loadRenewals()]);
    const c = contracts.find((x) => x.id === input.contractId);
    if (!c) return { ok: false, message: 'Contrato não encontrado.' };
    const rens = renewals.filter((r) => r.contractId === input.contractId);
    if (!canEnd(c, rens, hoje())) {
      return {
        ok: false,
        message:
          'Encerrar é calendário: só contrato em vigor com a vigência (renovações incluídas) vencida.',
      };
    }
    await port.setStatus({ contractId: input.contractId, status: 'ended' });
    revalidatePath('/contratos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function terminateContract(input: {
  contractId: string;
  reason: string;
}): Promise<ActionResult> {
  try {
    const port = await getCtrPort();
    const contracts = await port.loadContracts();
    const c = contracts.find((x) => x.id === input.contractId);
    if (!c) return { ok: false, message: 'Contrato não encontrado.' };
    const porQueNao = whyCannotTerminate(c, input.reason);
    if (porQueNao !== null) return { ok: false, message: porQueNao };
    await port.setStatus({
      contractId: input.contractId,
      status: 'terminated',
      reason: input.reason.trim(),
    });
    revalidatePath('/contratos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function registerAdjustment(input: {
  contractId: string;
  adjustedOn: string;
  indexName: string;
  newValueCents: number;
  note: string;
}): Promise<ActionResult> {
  if (input.indexName.trim().length === 0) {
    return { ok: false, message: 'Reajuste sem índice é a linha muda — escreva o índice ou o acordo.' };
  }
  if (!Number.isInteger(input.newValueCents) || input.newValueCents <= 0) {
    return { ok: false, message: 'O valor reajustado precisa ser maior que zero, em centavos.' };
  }
  try {
    const port = await getCtrPort();
    const contracts = await port.loadContracts();
    const c = contracts.find((x) => x.id === input.contractId);
    if (!c) return { ok: false, message: 'Contrato não encontrado.' };
    if (!canAdjust(c)) {
      return { ok: false, message: 'Só se reajusta contrato em vigor, com valor.' };
    }
    await port.registerAdjustment({
      contractId: input.contractId,
      adjustedOn: input.adjustedOn,
      indexName: input.indexName.trim(),
      newValueCents: input.newValueCents,
      note: input.note,
    });
    revalidatePath('/contratos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function renewContract(input: {
  contractId: string;
  newEndsOn: string;
  note: string;
}): Promise<ActionResult> {
  try {
    const port = await getCtrPort();
    const [contracts, renewals] = await Promise.all([port.loadContracts(), port.loadRenewals()]);
    const c = contracts.find((x) => x.id === input.contractId);
    if (!c) return { ok: false, message: 'Contrato não encontrado.' };
    const rens = renewals.filter((r) => r.contractId === input.contractId);
    // ⭐ "Renovar estende" é decisão do PACOTE — a tela só repete a recusa.
    const porQueNao = whyCannotRenewTo(c, rens, input.newEndsOn);
    if (porQueNao !== null) return { ok: false, message: porQueNao };
    await port.renewContract({
      contractId: input.contractId,
      newEndsOn: input.newEndsOn,
      note: input.note,
    });
    revalidatePath('/contratos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
