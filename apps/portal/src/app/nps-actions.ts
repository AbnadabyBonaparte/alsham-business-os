'use server';

import { revalidatePath } from 'next/cache';

import { canClose, canEditSurvey, canOpen, validateNewSurvey, whyCannotRespond } from '@alsham/nps';

import { getNpsPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createSurvey(input: {
  title: string;
  question: string;
}): Promise<ActionResult<{ surveyId: string }>> {
  // ⭐ A validação é do PACOTE — a tela consome, nunca decide.
  const r = validateNewSurvey(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }
  try {
    const port = await getNpsPort();
    const { surveyId } = await port.createSurvey(r.value);
    revalidatePath('/pesquisas');
    return { ok: true, data: { surveyId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function updateDraftSurvey(input: {
  surveyId: string;
  title: string;
  question: string;
}): Promise<ActionResult> {
  const r = validateNewSurvey(input);
  if (!r.ok) {
    return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  }
  try {
    const port = await getNpsPort();
    const surveys = await port.loadSurveys();
    const s = surveys.find((x) => x.id === input.surveyId);
    if (!s) return { ok: false, message: 'Rodada não encontrada.' };
    if (!canEditSurvey(s.status)) {
      return { ok: false, message: 'A coleta congelou a pergunta: outra pergunta é pesquisa nova.' };
    }
    await port.updateDraft({ surveyId: input.surveyId, ...r.value });
    revalidatePath('/pesquisas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function openSurvey(input: { surveyId: string }): Promise<ActionResult> {
  try {
    const port = await getNpsPort();
    const surveys = await port.loadSurveys();
    const s = surveys.find((x) => x.id === input.surveyId);
    if (!s) return { ok: false, message: 'Rodada não encontrada.' };
    if (!canOpen(s.status)) {
      return { ok: false, message: 'Só o rascunho abre a coleta.' };
    }
    await port.setStatus({ surveyId: input.surveyId, status: 'open' });
    revalidatePath('/pesquisas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function closeSurvey(input: { surveyId: string }): Promise<ActionResult> {
  try {
    const port = await getNpsPort();
    const surveys = await port.loadSurveys();
    const s = surveys.find((x) => x.id === input.surveyId);
    if (!s) return { ok: false, message: 'Rodada não encontrada.' };
    if (!canClose(s.status)) {
      return { ok: false, message: 'Só a coleta aberta se encerra — e o encerrado é terminal.' };
    }
    await port.setStatus({ surveyId: input.surveyId, status: 'closed' });
    revalidatePath('/pesquisas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function recordResponse(input: {
  surveyId: string;
  score: number;
  comment: string;
  respondent: string;
}): Promise<ActionResult> {
  try {
    const port = await getNpsPort();
    const surveys = await port.loadSurveys();
    const s = surveys.find((x) => x.id === input.surveyId);
    if (!s) return { ok: false, message: 'Rodada não encontrada.' };
    // ⭐ A recusa com nome é do PACOTE — e o banco confere de novo.
    const porQueNao = whyCannotRespond(s, input.score);
    if (porQueNao !== null) return { ok: false, message: porQueNao };

    await port.recordResponse({
      surveyId: input.surveyId,
      score: input.score,
      comment: input.comment.trim(),
      respondent: input.respondent.trim(),
    });
    revalidatePath('/pesquisas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
