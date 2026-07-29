'use server';

import { revalidatePath } from 'next/cache';

import {
  canHold,
  canRegister,
  canTransitionEvent,
  canTransitionRegistration,
  isFull,
  validateNewEvent,
  validateNewRegistration,
} from '@alsham/event-management';
import type { EventStatus, NewEvent, NewRegistration, RegistrationStatus } from '@alsham/event-management';

import { getEvtPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createEvent(input: NewEvent): Promise<ActionResult<{ eventId: string }>> {
  const erro = validateNewEvent(input);
  if (erro !== null) return { ok: false, message: erro };

  try {
    const port = await getEvtPort();
    const { eventId } = await port.createEvent(input);
    revalidatePath('/eventos');
    return { ok: true, data: { eventId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function changeEventStatus(input: {
  eventId: string;
  to: EventStatus;
}): Promise<ActionResult> {
  try {
    const port = await getEvtPort();
    const events = await port.loadEvents();
    const event = events.find((e) => e.id === input.eventId);
    if (!event) return { ok: false, message: 'Evento não encontrado.' };
    if (!canTransitionEvent(event.status, input.to)) {
      return { ok: false, message: 'Esta mudança de estado não existe no ciclo de vida do evento.' };
    }
    if (input.to === 'held' && !canHold(event, new Date().toISOString())) {
      return {
        ok: false,
        message: 'O evento ainda não começou — registrá-lo como realizado mentiria sobre o calendário.',
      };
    }
    await port.updateEventStatus({ eventId: input.eventId, status: input.to });
    revalidatePath('/eventos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function registerAttendee(
  input: NewRegistration,
): Promise<ActionResult<{ registrationId: string }>> {
  const erro = validateNewRegistration(input);
  if (erro !== null) return { ok: false, message: erro };

  try {
    const port = await getEvtPort();
    const [events, registrations] = await Promise.all([
      port.loadEvents(),
      port.loadRegistrations(),
    ]);
    const event = events.find((e) => e.id === input.eventId);
    if (!event) return { ok: false, message: 'Evento não encontrado.' };
    if (!canRegister(event)) {
      return { ok: false, message: 'Inscrição só em evento publicado — publicar é abrir a lista.' };
    }
    if (isFull(event, registrations)) {
      return { ok: false, message: 'O evento está lotado. Lista de espera ainda não existe — e a tela não finge que sim.' };
    }
    const { registrationId } = await port.createRegistration(input);
    revalidatePath('/eventos');
    return { ok: true, data: { registrationId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function changeRegistrationStatus(input: {
  registrationId: string;
  to: RegistrationStatus;
}): Promise<ActionResult> {
  try {
    const port = await getEvtPort();
    const registrations = await port.loadRegistrations();
    const reg = registrations.find((r) => r.id === input.registrationId);
    if (!reg) return { ok: false, message: 'Inscrição não encontrada.' };
    if (!canTransitionRegistration(reg.status, input.to)) {
      return {
        ok: false,
        message: 'Esta mudança não existe: quem cancelou e voltou atrás é inscrição nova.',
      };
    }
    await port.updateRegistrationStatus({ registrationId: input.registrationId, status: input.to });
    revalidatePath('/eventos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
