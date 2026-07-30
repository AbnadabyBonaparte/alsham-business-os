'use server';

import { revalidatePath } from 'next/cache';

import {
  canClose,
  canInteract,
  canReopen,
  canResolve,
  canStart,
  validateInteraction,
  validateNewTicket,
} from '@alsham/care';

import { getCarePort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createTicket(input: {
  subject: string;
  description: string;
  requesterName: string;
  requesterContact: string;
  categoryId: string | null;
  priorityId: string | null;
  dueAt: string;
}): Promise<ActionResult<{ ticketId: string }>> {
  // ⭐ A validação é do PACOTE — a tela não decide (Regra de Ouro).
  const r = validateNewTicket(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }

  try {
    const port = await getCarePort();
    const { ticketId } = await port.createTicket({
      subject: r.value.subject,
      description: r.value.description,
      requesterName: r.value.requesterName,
      requesterContact: r.value.requesterContact,
      categoryId: input.categoryId,
      priorityId: input.priorityId,
      dueAt: r.value.dueAt,
    });
    revalidatePath('/atendimento');
    return { ok: true, data: { ticketId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function moveTicket(input: {
  ticketId: string;
  to: 'open' | 'in_progress' | 'resolved' | 'closed';
  resolutionNote?: string;
}): Promise<ActionResult> {
  try {
    const port = await getCarePort();
    const tickets = await port.loadTickets();
    const t = tickets.find((x) => x.id === input.ticketId);
    if (!t) return { ok: false, message: 'Caso não encontrado.' };

    // ⭐ A régua do movimento é do PACOTE, transição a transição.
    const pode =
      input.to === 'in_progress'
        ? canStart(t.status)
        : input.to === 'resolved'
          ? canResolve(t.status)
          : input.to === 'closed'
            ? canClose(t.status)
            : canReopen(t.status) || t.status === 'in_progress';
    if (!pode) {
      return {
        ok: false,
        message:
          input.to === 'open' && t.status === 'closed'
            ? 'Fechado é terminal: quem volta depois de fechado é caso novo.'
            : `O caso não vai de ${t.status} para ${input.to}.`,
      };
    }

    await port.setStatus({
      ticketId: input.ticketId,
      status: input.to,
      ...(input.resolutionNote !== undefined ? { resolutionNote: input.resolutionNote } : {}),
    });
    revalidatePath('/atendimento');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function recordInteraction(input: {
  ticketId: string;
  body: string;
  channel: string;
}): Promise<ActionResult> {
  const r = validateInteraction(input.body);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }
  try {
    const port = await getCarePort();
    const tickets = await port.loadTickets();
    const t = tickets.find((x) => x.id === input.ticketId);
    if (!t) return { ok: false, message: 'Caso não encontrado.' };
    if (!canInteract(t.status)) {
      return { ok: false, message: 'Caso fechado não conversa — abra caso novo com referência.' };
    }
    await port.recordInteraction({
      ticketId: input.ticketId,
      body: r.value.body,
      channel: input.channel.trim() === '' ? null : input.channel.trim(),
    });
    revalidatePath('/atendimento');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function createCategory(input: { name: string }): Promise<ActionResult> {
  if (input.name.trim().length === 0) {
    return { ok: false, message: 'A categoria precisa de um nome.' };
  }
  try {
    const port = await getCarePort();
    await port.createCategory({ name: input.name.trim() });
    revalidatePath('/atendimento');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function createPriority(input: {
  name: string;
  position: number;
}): Promise<ActionResult> {
  if (input.name.trim().length === 0) {
    return { ok: false, message: 'A prioridade precisa de um nome.' };
  }
  try {
    const port = await getCarePort();
    await port.createPriority({ name: input.name.trim(), position: input.position });
    revalidatePath('/atendimento');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
