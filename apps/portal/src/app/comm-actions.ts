'use server';

import { revalidatePath } from 'next/cache';

import { canArchive, canEditNotice, validateNewNotice, whyCannotAck, whyCannotPublish } from '@alsham/comms';

import { getCommPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createNotice(input: {
  title: string;
  body: string;
  audience: string;
  correctsNoticeId: string | null;
}): Promise<ActionResult<{ noticeId: string }>> {
  // ⭐ A validação é do PACOTE — a tela consome, nunca decide.
  const r = validateNewNotice(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }

  try {
    const port = await getCommPort();
    const { noticeId } = await port.createNotice({
      title: r.value.title,
      body: r.value.body,
      audience: r.value.audience,
      correctsNoticeId: input.correctsNoticeId,
    });
    revalidatePath('/comunicados');
    return { ok: true, data: { noticeId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function updateDraftNotice(input: {
  noticeId: string;
  title: string;
  body: string;
  audience: string;
}): Promise<ActionResult> {
  const r = validateNewNotice(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }
  try {
    const port = await getCommPort();
    const notices = await port.loadNotices();
    const n = notices.find((x) => x.id === input.noticeId);
    if (!n) return { ok: false, message: 'Comunicado não encontrado.' };
    if (!canEditNotice(n.status)) {
      return { ok: false, message: 'A palavra dada não se edita: corrigir é publicar comunicado novo.' };
    }
    await port.updateDraft({
      noticeId: input.noticeId,
      title: r.value.title,
      body: r.value.body,
      audience: r.value.audience,
    });
    revalidatePath('/comunicados');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function publishNotice(input: { noticeId: string }): Promise<ActionResult> {
  try {
    const port = await getCommPort();
    const notices = await port.loadNotices();
    const n = notices.find((x) => x.id === input.noticeId);
    if (!n) return { ok: false, message: 'Comunicado não encontrado.' };
    // ⭐ A recusa com nome é do PACOTE.
    const porQueNao = whyCannotPublish(n);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.setStatus({ noticeId: input.noticeId, status: 'published' });
    revalidatePath('/comunicados');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function archiveNotice(input: { noticeId: string }): Promise<ActionResult> {
  try {
    const port = await getCommPort();
    const notices = await port.loadNotices();
    const n = notices.find((x) => x.id === input.noticeId);
    if (!n) return { ok: false, message: 'Comunicado não encontrado.' };
    if (!canArchive(n.status)) {
      return { ok: false, message: 'Só o que está no mural se arquiva — e o arquivo é terminal.' };
    }
    await port.setStatus({ noticeId: input.noticeId, status: 'archived' });
    revalidatePath('/comunicados');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function ackNotice(input: { noticeId: string }): Promise<ActionResult> {
  try {
    const port = await getCommPort();
    const [notices, acks, userId] = await Promise.all([
      port.loadNotices(),
      port.loadAcks(),
      port.currentUserId(),
    ]);
    const n = notices.find((x) => x.id === input.noticeId);
    if (!n) return { ok: false, message: 'Comunicado não encontrado.' };
    // ⭐ A recusa com nome é do PACOTE — e o banco confere de novo.
    const porQueNao = whyCannotAck(n, userId, acks);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.ackNotice({ noticeId: input.noticeId });
    revalidatePath('/comunicados');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
