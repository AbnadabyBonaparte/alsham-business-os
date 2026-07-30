'use server';

import { revalidatePath } from 'next/cache';

import { validateCenterName, validateExecution, whyCannotActivate } from '@alsham/cost-centers';

import { getCcPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function createCenter(input: { name: string }): Promise<ActionResult<{ centerId: string }>> {
  const r = validateCenterName(input.name);
  if (!r.ok) return { ok: false, message: r.problems.map((p) => p.message).join(' ') };
  try {
    const port = await getCcPort();
    const { centerId } = await port.createCenter({ name: r.value.name });
    revalidatePath('/centros-de-custo');
    return { ok: true, data: { centerId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function setCenterStatus(input: {
  centerId: string;
  status: 'active' | 'archived';
}): Promise<ActionResult> {
  try {
    const port = await getCcPort();
    await port.setCenterStatus(input);
    revalidatePath('/centros-de-custo');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function createRule(input: { name: string }): Promise<ActionResult<{ ruleId: string }>> {
  if (input.name.trim().length === 0) return { ok: false, message: 'Dê um nome à regra.' };
  try {
    const port = await getCcPort();
    const { ruleId } = await port.createRule({ name: input.name.trim() });
    revalidatePath('/centros-de-custo');
    return { ok: true, data: { ruleId } };
  } catch (err) {
    return toResult(err);
  }
}

export async function addRuleLine(input: {
  ruleId: string;
  centerId: string;
  percent: number;
}): Promise<ActionResult> {
  const bp = Math.round(input.percent * 100);
  if (!Number.isInteger(bp) || bp <= 0 || bp > 10000) {
    return { ok: false, message: 'O percentual vai de 0,01% a 100%.' };
  }
  try {
    const port = await getCcPort();
    await port.addRuleLine({ ruleId: input.ruleId, centerId: input.centerId, basisPoints: bp });
    revalidatePath('/centros-de-custo');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function removeRuleLine(input: { ruleId: string; centerId: string }): Promise<ActionResult> {
  try {
    const port = await getCcPort();
    await port.removeRuleLine(input);
    revalidatePath('/centros-de-custo');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function activateRule(input: { ruleId: string }): Promise<ActionResult> {
  try {
    const port = await getCcPort();
    const rules = await port.loadRules();
    const rule = rules.find((r) => r.id === input.ruleId);
    if (!rule) return { ok: false, message: 'Regra não encontrada.' };
    // ⭐ A recusa com nome (a física do 100%) é do PACOTE.
    const porQueNao = whyCannotActivate(rule);
    if (porQueNao !== null) return { ok: false, message: porQueNao };
    await port.setRuleStatus({ ruleId: input.ruleId, status: 'active' });
    revalidatePath('/centros-de-custo');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function archiveRule(input: { ruleId: string }): Promise<ActionResult> {
  try {
    const port = await getCcPort();
    await port.setRuleStatus({ ruleId: input.ruleId, status: 'archived' });
    revalidatePath('/centros-de-custo');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function executeRateio(input: {
  ruleId: string;
  sourceKind: string;
  sourceName: string;
  total: string;
  currency: string;
  competenceOn: string;
  note: string;
}): Promise<ActionResult> {
  const totalCents = Math.round(Number(input.total.replace(',', '.')) * 100);
  const v = validateExecution({
    totalCents,
    currency: input.currency,
    sourceKind: input.sourceKind,
    competenceOn: input.competenceOn,
  });
  if (!v.ok) return { ok: false, message: v.problems.map((p) => p.message).join(' ') };
  try {
    const port = await getCcPort();
    await port.executeRateio({
      ruleId: input.ruleId,
      sourceKind: v.value.sourceKind,
      sourceName: input.sourceName.trim(),
      totalCents: v.value.totalCents,
      currency: v.value.currency,
      competenceOn: v.value.competenceOn,
      note: input.note.trim(),
      reason: '',
    });
    revalidatePath('/centros-de-custo');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
