'use server';

import { revalidatePath } from 'next/cache';

import {
  canActivate,
  validateNewGoal,
  whyCannotCancel,
  whyCannotClose,
  whyCannotReport,
} from '@alsham/goals';

import { getGoalPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createGoal(input: {
  title: string;
  description: string;
  metric: string;
  targetValue: number | null;
  currency: string | null;
  startsOn: string;
  endsOn: string;
}): Promise<ActionResult<{ goalId: string }>> {
  // ⭐ A validação — inclusive "moeda exige valor" — é do PACOTE.
  const r = validateNewGoal(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }

  try {
    const port = await getGoalPort();
    const { goalId } = await port.createGoal({
      title: r.value.title,
      description: r.value.description,
      metric: r.value.metric,
      targetValue: r.value.targetValue,
      currency: r.value.currency,
      startsOn: r.value.startsOn,
      endsOn: r.value.endsOn,
    });
    revalidatePath('/metas');
    return { ok: true, data: { goalId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function activateGoal(input: { goalId: string }): Promise<ActionResult> {
  try {
    const port = await getGoalPort();
    const goals = await port.loadGoals();
    const g = goals.find((x) => x.id === input.goalId);
    if (!g) return { ok: false, message: 'Meta não encontrada.' };
    if (!canActivate(g.status)) {
      return { ok: false, message: 'Só o rascunho se ativa — a meta já corre ou já fechou.' };
    }
    await port.setStatus({ goalId: input.goalId, status: 'active' });
    revalidatePath('/metas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function reportCheckin(input: {
  goalId: string;
  reportedValue: number;
  note: string;
}): Promise<ActionResult> {
  if (!Number.isFinite(input.reportedValue)) {
    return { ok: false, message: 'O check-in leva um número — a unidade mora na métrica.' };
  }
  try {
    const port = await getGoalPort();
    const goals = await port.loadGoals();
    const g = goals.find((x) => x.id === input.goalId);
    if (!g) return { ok: false, message: 'Meta não encontrada.' };
    // ⭐ A recusa com nome é do PACOTE.
    const porQueNao = whyCannotReport(g);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.reportCheckin({
      goalId: input.goalId,
      reportedValue: input.reportedValue,
      note: input.note.trim(),
    });
    revalidatePath('/metas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function closeGoal(input: {
  goalId: string;
  outcome: 'achieved' | 'missed';
}): Promise<ActionResult> {
  try {
    const port = await getGoalPort();
    const [goals, checkins] = await Promise.all([port.loadGoals(), port.loadCheckins()]);
    const g = goals.find((x) => x.id === input.goalId);
    if (!g) return { ok: false, message: 'Meta não encontrada.' };
    const doLivro = checkins.filter((c) => c.goalId === g.id).length;
    const porQueNao = whyCannotClose(g, doLivro, input.outcome);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.setStatus({ goalId: input.goalId, status: input.outcome });
    revalidatePath('/metas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function cancelGoal(input: {
  goalId: string;
  reason: string;
}): Promise<ActionResult> {
  try {
    const port = await getGoalPort();
    const goals = await port.loadGoals();
    const g = goals.find((x) => x.id === input.goalId);
    if (!g) return { ok: false, message: 'Meta não encontrada.' };
    const porQueNao = whyCannotCancel(g, input.reason);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.setStatus({
      goalId: input.goalId,
      status: 'cancelled',
      cancelReason: input.reason.trim(),
    });
    revalidatePath('/metas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
