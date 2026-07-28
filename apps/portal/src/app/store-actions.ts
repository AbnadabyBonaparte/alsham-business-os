'use server';

import { revalidatePath } from 'next/cache';

import { getStorePort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

/**
 * As Server Actions da Store.
 *
 * ⭐ **Leia o que elas NÃO fazem.** Não conferem permissão, não checam se o
 * módulo está publicado, não contam quantos cabem no plano. Tudo isso é
 * `core.install_module()`, no banco, que é quem decide — e é o único lugar
 * onde essas regras existem.
 *
 * Estas funções pegam o clique, chamam a porta, e devolvem a mensagem que o
 * banco deu. Se um dia aparecer aqui um `if` sobre plano ou papel, a regra
 * passou a existir em dois lugares que vão divergir.
 */

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export async function installModuleAction(input: {
  moduleId: string;
  roleKey: string;
}): Promise<ActionResult> {
  try {
    const port = await getStorePort();
    await port.install(input);
    revalidatePath('/store');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

export async function uninstallModuleAction(input: { moduleId: string }): Promise<ActionResult> {
  try {
    const port = await getStorePort();
    await port.uninstall(input);
    revalidatePath('/store');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
