'use server';

import { revalidatePath } from 'next/cache';

import {
  canReturnToQueue,
  canTake,
  validateNewLead,
  whyCannotDiscard,
  whyCannotQualify,
} from '@alsham/leads';

import { getLeadPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createLead(input: {
  name: string;
  contact: string;
  source: string;
  interest: string;
}): Promise<ActionResult<{ leadId: string }>> {
  // ⭐ A validação é do PACOTE — a fila não faz interrogatório.
  const r = validateNewLead(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }

  try {
    const port = await getLeadPort();
    const { leadId } = await port.createLead({
      name: r.value.name,
      contact: r.value.contact,
      source: r.value.source,
      interest: r.value.interest,
    });
    revalidatePath('/leads');
    return { ok: true, data: { leadId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function moveLead(input: {
  leadId: string;
  to: 'in_contact' | 'new';
}): Promise<ActionResult> {
  try {
    const port = await getLeadPort();
    const leads = await port.loadLeads();
    const l = leads.find((x) => x.id === input.leadId);
    if (!l) return { ok: false, message: 'Lead não encontrado.' };

    const pode = input.to === 'in_contact' ? canTake(l.status) : canReturnToQueue(l.status);
    if (!pode) return { ok: false, message: `O lead não vai de ${l.status} para ${input.to}.` };

    await port.setStatus({ leadId: input.leadId, status: input.to });
    revalidatePath('/leads');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function qualifyLead(input: {
  leadId: string;
  partyId: string;
  partyName: string;
  opportunityId: string;
  opportunityTitle: string;
}): Promise<ActionResult> {
  try {
    const port = await getLeadPort();
    const leads = await port.loadLeads();
    const l = leads.find((x) => x.id === input.leadId);
    if (!l) return { ok: false, message: 'Lead não encontrado.' };
    // ⭐ A recusa com nome é do PACOTE.
    const porQueNao = whyCannotQualify(l);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    const partyId = input.partyId.trim();
    const partyName = input.partyName.trim();
    const oppId = input.opportunityId.trim();
    const oppTitle = input.opportunityTitle.trim();
    if ((partyId === '') !== (partyName === '')) {
      return { ok: false, message: 'O vínculo com a contraparte leva id E nome carimbado — os dois ou nenhum.' };
    }
    if ((oppId === '') !== (oppTitle === '')) {
      return { ok: false, message: 'O vínculo com o negócio leva id E título carimbado — os dois ou nenhum.' };
    }

    await port.setStatus({
      leadId: input.leadId,
      status: 'qualified',
      partyId: partyId === '' ? null : partyId,
      partyName,
      opportunityId: oppId === '' ? null : oppId,
      opportunityTitle: oppTitle,
    });
    revalidatePath('/leads');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function discardLead(input: {
  leadId: string;
  reason: string;
}): Promise<ActionResult> {
  try {
    const port = await getLeadPort();
    const leads = await port.loadLeads();
    const l = leads.find((x) => x.id === input.leadId);
    if (!l) return { ok: false, message: 'Lead não encontrado.' };
    const porQueNao = whyCannotDiscard(l, input.reason);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.setStatus({
      leadId: input.leadId,
      status: 'discarded',
      discardReason: input.reason.trim(),
    });
    revalidatePath('/leads');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
