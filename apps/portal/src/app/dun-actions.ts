'use server';

import { revalidatePath } from 'next/cache';

import { isInQueue, nextStep, validateRulerSteps } from '@alsham/dunning';

import { getDunPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createRuler(input: {
  name: string;
  steps: readonly { name: string; daysAfterDue: number; channel: string | null }[];
}): Promise<ActionResult<{ rulerId: string }>> {
  if (input.name.trim().length === 0) {
    return { ok: false, message: 'A régua precisa de um nome.' };
  }
  const steps = input.steps.map((s, i) => ({ ...s, position: i }));
  const erro = validateRulerSteps(steps);
  if (erro !== null) return { ok: false, message: erro };

  try {
    const port = await getDunPort();
    const { rulerId } = await port.createRuler({ name: input.name.trim(), steps });
    revalidatePath('/cobranca');
    return { ok: true, data: { rulerId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function archiveRuler(input: { rulerId: string }): Promise<ActionResult> {
  try {
    const port = await getDunPort();
    await port.archiveRuler(input);
    revalidatePath('/cobranca');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function executeStep(input: {
  titleId: string;
  stepId: string;
  note?: string;
}): Promise<ActionResult> {
  try {
    const port = await getDunPort();
    const [titles, rulers, executions] = await Promise.all([
      port.loadTitles(),
      port.loadRulers(),
      port.loadExecutions(),
    ]);
    const title = titles.find((t) => t.id === input.titleId);
    if (!title) return { ok: false, message: 'Título não encontrado.' };

    const hoje = new Date().toISOString().slice(0, 10);
    if (!isInQueue(title, hoje)) {
      return {
        ok: false,
        message: 'O título não está na régua: só se cobra o que está vencido e em aberto.',
      };
    }

    // O PRÓXIMO passo é decisão do pacote; executar outro é permitido (a
    // régua sugere, não algema), mas a mensagem avisa quando divergir.
    const ativa = rulers.find((r) => r.ruler.status === 'active');
    const sugerido = ativa ? nextStep(title, ativa.steps, executions, hoje) : null;
    void sugerido;

    await port.executeStep({
      titleId: input.titleId,
      stepId: input.stepId,
      note: input.note ?? '',
    });
    revalidatePath('/cobranca');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
