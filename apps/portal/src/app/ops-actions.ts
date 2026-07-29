'use server';

import { revalidatePath } from 'next/cache';

import {
  canTransition,
  nextVersion,
  orderedStages,
  validateNewOrder,
  validateStages,
  whyCannotAdvance,
  whyCannotSkip,
} from '@alsham/ops';
import type { NewStage, OrderStatus } from '@alsham/ops';

import { getOpsPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

/**
 * As Server Actions do Módulo 7.
 *
 * ⭐ **Leia o que elas fazem — e principalmente o que não fazem.**
 *
 * Não existe aqui uma lista de etapas, nem a conta de qual é a próxima, nem a
 * regra de quem pode pular. Tudo isso é `@alsham/ops`: `nextStage()`,
 * `whyCannotAdvance()`, `whyCannotSkip()`, `nextVersion()`, `canTransition()`.
 *
 * Quem autoriza é o **banco**: `ops.advance_order()` exige `ops.order.decide`
 * quando a etapa atual pede aprovação, e `ops.order.manage` nas demais; a trilha
 * não tem porta de escrita para ninguém. A tela esconder o botão é cortesia.
 */

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

/**
 * Cria uma esteira com as etapas que o tenant desenhou.
 *
 * ⭐ É a Lei das Etapas virando produto: quem escolhe nome, ordem, o que exige
 * aprovação e o que pode ser pulado é o cliente, aqui, em runtime.
 */
export async function createPipeline(input: {
  name: string;
  description: string;
  stages: readonly NewStage[];
}): Promise<ActionResult<{ pipelineId: string }>> {
  if (input.name.trim().length === 0) {
    return { ok: false, message: 'A esteira precisa de um nome.' };
  }
  const problema = validateStages(input.stages);
  if (problema !== null) return { ok: false, message: problema };

  try {
    const port = await getOpsPort();
    const r = await port.createPipeline({
      name: input.name.trim(),
      description: input.description.trim(),
      stages: input.stages.map((s) => ({
        name: s.name.trim(),
        position: s.position,
        requiresApproval: s.requiresApproval,
        skippable: s.skippable,
      })),
    });
    revalidatePath('/esteiras');
    revalidatePath('/esteira');
    return { ok: true, data: r };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Abre uma OS na PRIMEIRA etapa da esteira escolhida.
 *
 * ⚠️ Qual é a primeira etapa não é decidido aqui: vem de `orderedStages()`,
 * pela `position`. Escolher "a primeira da lista que o banco devolveu" seria o
 * defeito mais barato de cometer e o mais caro de notar.
 */
export async function openOrder(input: {
  pipelineId: string;
  title: string;
  description: string;
  dueDate: string | null;
}): Promise<ActionResult<{ orderId: string }>> {
  const problema = validateNewOrder(input);
  if (problema !== null) return { ok: false, message: problema };

  try {
    const port = await getOpsPort();
    const esteiras = await port.loadPipelines();
    const escolhida = esteiras.find((e) => e.pipeline.id === input.pipelineId);
    if (escolhida === undefined) {
      return { ok: false, message: 'Esteira não encontrada.' };
    }

    const primeira = orderedStages(escolhida.stages)[0];
    if (primeira === undefined) {
      return {
        ok: false,
        message: 'Esta esteira ainda não tem etapas. Desenhe as etapas antes de abrir uma OS.',
      };
    }

    const r = await port.createOrder({
      pipelineId: input.pipelineId,
      stageId: primeira.id,
      title: input.title.trim(),
      description: input.description.trim(),
      assigneeUserId: null,
      dueDate: input.dueDate === null || input.dueDate.trim() === '' ? null : input.dueDate,
    });
    revalidatePath('/esteira');
    return { ok: true, data: r };
  } catch (err) {
    return toResult(err);
  }
}

/** Avança a OS para a próxima etapa da esteira. */
export async function advanceOrder(input: {
  orderId: string;
  note: string;
}): Promise<ActionResult> {
  try {
    const port = await getOpsPort();
    const [ordens, esteiras] = await Promise.all([port.loadOrders(), port.loadPipelines()]);
    const os = ordens.find((o) => o.id === input.orderId);
    if (os === undefined) return { ok: false, message: 'Ordem de serviço não encontrada.' };

    const etapas = esteiras.find((e) => e.pipeline.id === os.pipelineId)?.stages ?? [];
    // Reconfere no motor: botão escondido não é regra.
    const porque = whyCannotAdvance(os, etapas);
    if (porque !== null) return { ok: false, message: porque };

    await port.advance({ orderId: input.orderId, note: input.note.trim() });
    revalidatePath('/esteira');
    revalidatePath(`/esteira/${input.orderId}`);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Pula a etapa atual — **e a razão é obrigatória.**
 *
 * ⭐ Pular é ATO REGISTRADO. A recusa por falta de razão existe em três lugares
 * de propósito: no formulário, aqui, e no `ops.skip_stage()`. Trilha que
 * registra a omissão e esconde o motivo é pior do que trilha que falta.
 */
export async function skipStage(input: {
  orderId: string;
  reason: string;
}): Promise<ActionResult> {
  if (input.reason.trim().length === 0) {
    return {
      ok: false,
      message: 'Pular uma etapa exige a razão — ela fica na trilha, e é o que explica a omissão.',
    };
  }

  try {
    const port = await getOpsPort();
    const [ordens, esteiras] = await Promise.all([port.loadOrders(), port.loadPipelines()]);
    const os = ordens.find((o) => o.id === input.orderId);
    if (os === undefined) return { ok: false, message: 'Ordem de serviço não encontrada.' };

    const etapas = esteiras.find((e) => e.pipeline.id === os.pipelineId)?.stages ?? [];
    const porque = whyCannotSkip(os, etapas);
    if (porque !== null) return { ok: false, message: porque };

    await port.skip({ orderId: input.orderId, reason: input.reason.trim() });
    revalidatePath('/esteira');
    revalidatePath(`/esteira/${input.orderId}`);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Devolve a OS para uma etapa anterior — o **REFAZER**.
 *
 * ⭐ A instrução é obrigatória: reprovar sem dizer o que mudar devolve a OS e
 * trava quem recebe. É o ciclo aprovar/rejeitar/refazer minerado do kraken-v2,
 * com a instrução guardada junto da devolução.
 */
export async function sendBackOrder(input: {
  orderId: string;
  toStageId: string;
  instruction: string;
}): Promise<ActionResult> {
  if (input.instruction.trim().length === 0) {
    return {
      ok: false,
      message: 'Devolver exige a instrução do que refazer — sem ela, quem recebe fica travado.',
    };
  }

  try {
    const port = await getOpsPort();
    const ordens = await port.loadOrders();
    const os = ordens.find((o) => o.id === input.orderId);
    if (os === undefined) return { ok: false, message: 'Ordem de serviço não encontrada.' };

    if (os.status === 'cancelled') {
      return {
        ok: false,
        message: 'OS cancelada não se devolve: retomar um trabalho cancelado é OS nova.',
      };
    }

    await port.sendBack({
      orderId: input.orderId,
      toStageId: input.toStageId,
      instruction: input.instruction.trim(),
    });
    revalidatePath('/esteira');
    revalidatePath(`/esteira/${input.orderId}`);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Conclui ou cancela a OS.
 *
 * ⚠️ Cancelar é `status`, nunca `delete`. E a mensagem de recusa diz o
 * CAMINHO, não só o "não".
 */
export async function changeOrderStatus(input: {
  orderId: string;
  to: OrderStatus;
}): Promise<ActionResult> {
  try {
    const port = await getOpsPort();
    const ordens = await port.loadOrders();
    const os = ordens.find((o) => o.id === input.orderId);
    if (os === undefined) return { ok: false, message: 'Ordem de serviço não encontrada.' };

    if (!canTransition(os.status, input.to)) {
      return {
        ok: false,
        message:
          os.status === 'done' && input.to === 'cancelled'
            ? 'OS concluída não se cancela: o trabalho foi entregue. Devolva-a primeiro, e cancele depois.'
            : os.status === 'cancelled'
              ? 'Esta OS já está cancelada. Retomar um trabalho cancelado é OS nova.'
              : 'Esta mudança de estado não existe no ciclo de vida da OS.',
      };
    }

    await port.updateStatus({ orderId: input.orderId, status: input.to });
    revalidatePath('/esteira');
    revalidatePath(`/esteira/${input.orderId}`);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Registra uma versão de entregável.
 *
 * ⭐ A versão vem de `nextVersion()`, no pacote. Quem GARANTE que ela não
 * colide é o `unique` do banco: duas refações simultâneas calculam a mesma e a
 * segunda é recusada, em vez de sobrescrever a primeira.
 */
export async function registerDeliverable(input: {
  orderId: string;
  kind: string;
  reference: string;
  instruction: string;
}): Promise<ActionResult> {
  if (input.kind.trim().length === 0) {
    return { ok: false, message: 'O entregável precisa de um tipo — "arte", "laudo", o que for.' };
  }
  if (input.reference.trim().length === 0) {
    return {
      ok: false,
      message: 'O entregável precisa de uma referência: um link, um caminho ou um número.',
    };
  }

  try {
    const port = await getOpsPort();
    const ordens = await port.loadOrders();
    const os = ordens.find((o) => o.id === input.orderId);
    if (os === undefined) return { ok: false, message: 'Ordem de serviço não encontrada.' };

    const [{ deliverables }, esteiras] = await Promise.all([
      port.loadOrderDetail(input.orderId),
      port.loadPipelines(),
    ]);
    const etapa = esteiras
      .find((e) => e.pipeline.id === os.pipelineId)
      ?.stages.find((s) => s.id === os.currentStageId);

    await port.registerDeliverable({
      orderId: input.orderId,
      stageId: etapa?.id ?? null,
      stageName: etapa?.name ?? null,
      kind: input.kind.trim(),
      reference: input.reference.trim(),
      version: nextVersion(deliverables, input.orderId, input.kind.trim()),
      instruction: input.instruction.trim(),
    });

    revalidatePath(`/esteira/${input.orderId}`);
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
