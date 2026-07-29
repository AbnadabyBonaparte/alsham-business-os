'use server';

import { revalidatePath } from 'next/cache';

import {
  canCancel,
  canDecide,
  canSend,
  canTransition,
  isExpirable,
  validateNewProposal,
} from '@alsham/quotes';
import type { NewProposalInput } from '@alsham/quotes';

import { getQuotePort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export interface RegisterFailure {
  readonly ok: false;
  readonly message: string;
  readonly problems?: readonly { field: string; message: string }[];
}

export async function registerProposal(
  input: NewProposalInput,
): Promise<ActionResult<{ proposalId: string }> | RegisterFailure> {
  const validado = validateNewProposal(input);
  if (!validado.ok) {
    return { ok: false, message: 'Confira os campos destacados.', problems: validado.problems };
  }

  try {
    const port = await getQuotePort();
    const { proposalId } = await port.createProposal(validado.value);
    revalidatePath('/propostas');
    return { ok: true, data: { proposalId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function sendProposal(input: { proposalId: string }): Promise<ActionResult> {
  try {
    const port = await getQuotePort();
    const proposals = await port.loadProposals();
    const proposal = proposals.find((p) => p.id === input.proposalId);
    if (!proposal) return { ok: false, message: 'Proposta não encontrada.' };
    if (!canSend(proposal.status) || !canTransition(proposal.status, 'sent')) {
      return { ok: false, message: 'Só rascunho vai à mesa.' };
    }
    await port.updateStatus({ proposalId: input.proposalId, status: 'sent' });
    revalidatePath('/propostas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function decideProposal(input: {
  proposalId: string;
  decision: 'accepted' | 'declined';
  note?: string;
}): Promise<ActionResult> {
  try {
    const port = await getQuotePort();
    const proposals = await port.loadProposals();
    const proposal = proposals.find((p) => p.id === input.proposalId);
    if (!proposal) return { ok: false, message: 'Proposta não encontrada.' };
    if (!canDecide(proposal.status)) {
      return {
        ok: false,
        message: 'Só proposta na mesa recebe veredito — e um fim não se reabre: renegociar é documento novo.',
      };
    }
    await port.updateStatus({
      proposalId: input.proposalId,
      status: input.decision,
      decisionNote: input.note ?? '',
    });
    revalidatePath('/propostas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function expireProposal(input: { proposalId: string }): Promise<ActionResult> {
  try {
    const port = await getQuotePort();
    const proposals = await port.loadProposals();
    const proposal = proposals.find((p) => p.id === input.proposalId);
    if (!proposal) return { ok: false, message: 'Proposta não encontrada.' };
    const hoje = new Date().toISOString().slice(0, 10);
    if (!isExpirable(proposal, hoje)) {
      return {
        ok: false,
        message:
          proposal.validUntil === null
            ? 'Proposta sem validade não expira: recuse-a ou retire-a.'
            : 'A validade ainda não venceu — expirar agora mentiria sobre o calendário.',
      };
    }
    await port.updateStatus({ proposalId: input.proposalId, status: 'expired' });
    revalidatePath('/propostas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function withdrawProposal(input: { proposalId: string }): Promise<ActionResult> {
  try {
    const port = await getQuotePort();
    const proposals = await port.loadProposals();
    const proposal = proposals.find((p) => p.id === input.proposalId);
    if (!proposal) return { ok: false, message: 'Proposta não encontrada.' };
    if (!canCancel(proposal.status)) {
      return { ok: false, message: 'Este estado não se retira — os fins são terminais.' };
    }
    await port.updateStatus({ proposalId: input.proposalId, status: 'cancelled' });
    revalidatePath('/propostas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
