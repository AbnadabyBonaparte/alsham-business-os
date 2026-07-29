'use server';

import { revalidatePath } from 'next/cache';

import {
  canClose,
  validateFunnelStages,
  validateNewOpportunity,
  whyCannotLose,
} from '@alsham/deals';
import type { NewOpportunity } from '@alsham/deals';

import { getDealPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createFunnel(input: {
  name: string;
  description: string;
  stageNames: readonly string[];
}): Promise<ActionResult<{ funnelId: string }>> {
  if (input.name.trim().length === 0) {
    return { ok: false, message: 'O funil precisa de um nome.' };
  }
  const stages = input.stageNames
    .map((n, i) => ({ name: n, position: i }))
    .filter((s) => s.name.trim().length > 0);
  const erro = validateFunnelStages(stages);
  if (erro !== null) return { ok: false, message: erro };

  try {
    const port = await getDealPort();
    const { funnelId } = await port.createFunnel({
      name: input.name.trim(),
      description: input.description,
      stages,
    });
    revalidatePath('/funil');
    return { ok: true, data: { funnelId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function openOpportunity(
  input: NewOpportunity,
): Promise<ActionResult<{ opportunityId: string }>> {
  const erro = validateNewOpportunity(input);
  if (erro !== null) return { ok: false, message: erro };

  try {
    const port = await getDealPort();
    const { opportunityId } = await port.createOpportunity(input);
    revalidatePath('/funil');
    return { ok: true, data: { opportunityId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function moveOpportunity(input: {
  opportunityId: string;
  toStageId: string;
  note?: string;
}): Promise<ActionResult> {
  try {
    const port = await getDealPort();
    await port.moveOpportunity({
      opportunityId: input.opportunityId,
      toStageId: input.toStageId,
      note: input.note ?? '',
    });
    revalidatePath('/funil');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function closeOpportunity(input: {
  opportunityId: string;
  outcome: 'won' | 'lost';
  reason: string;
}): Promise<ActionResult> {
  try {
    const port = await getDealPort();
    const opportunities = await port.loadOpportunities();
    const opp = opportunities.find((o) => o.id === input.opportunityId);
    if (!opp) return { ok: false, message: 'Negociação não encontrada.' };
    if (!canClose(opp.status)) {
      return { ok: false, message: 'A negociação já foi encerrada — voltar é oportunidade nova.' };
    }
    if (input.outcome === 'lost') {
      const porque = whyCannotLose(opp, input.reason);
      if (porque !== null) return { ok: false, message: porque };
    }
    await port.closeOpportunity(input);
    revalidatePath('/funil');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
