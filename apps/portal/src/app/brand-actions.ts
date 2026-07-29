'use server';

import { revalidatePath } from 'next/cache';

import { normalizeForbidden } from '@alsham/ai';

import { getBrandPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

/**
 * Salva o Cérebro da Marca do tenant.
 *
 * ⭐ A limpeza dos vetos é `normalizeForbidden()`, no pacote — a MESMA função
 * que monta o prompt e que confere o resultado. Se a limpeza estivesse aqui, o
 * termo salvo e o termo procurado poderiam divergir num espaço em branco.
 */
export async function saveBrandContext(input: {
  identity: string;
  tone: string;
  forbiddenRaw: string;
}): Promise<ActionResult> {
  try {
    const port = await getBrandPort();
    await port.save({
      identity: input.identity.trim(),
      tone: input.tone.trim(),
      forbidden: normalizeForbidden(input.forbiddenRaw.split('\n')),
    });
    revalidatePath('/ajustes');
    return { ok: true };
  } catch (err) {
    if (err instanceof DataPortError) return { ok: false, message: err.message };
    return { ok: false, message: 'Não foi possível salvar. Nada foi alterado.' };
  }
}
