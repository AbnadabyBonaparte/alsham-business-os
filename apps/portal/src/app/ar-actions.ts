'use server';

import { revalidatePath } from 'next/cache';

import { canTransition, validateNewReceivable } from '@alsham/accounts-receivable';
import type { NewReceivableInput, ReceivableStatus } from '@alsham/accounts-receivable';

import { getArPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

/**
 * As Server Actions do Módulo 5.
 *
 * ⭐ **Leia o que elas fazem — e principalmente o que não fazem.**
 *
 * Não existe aqui um `if (amountCents <= 0)`, nem uma lista de transições, nem
 * a conta do saldo. Tudo isso é `validateNewReceivable()` e `canTransition()`,
 * no pacote.
 *
 * Quem autoriza é o **banco**: a policy exige `ar.receivable.manage` para
 * gravar, e o trigger `ar.guard_status_transition()` recusa a passagem para
 * `cancelled` sem `ar.receivable.cancel`. A tela esconder o botão é cortesia.
 */

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export interface RegisterFailure {
  readonly ok: false;
  readonly message: string;
  /** Os campos culpados, para o formulário saber onde pintar. */
  readonly problems?: readonly { field: string; message: string }[];
}

/** Registra um título a receber. */
export async function registerReceivable(
  input: NewReceivableInput,
): Promise<ActionResult<{ receivableId: string }> | RegisterFailure> {
  const validado = validateNewReceivable(input);
  if (!validado.ok) {
    return { ok: false, message: 'Confira os campos destacados.', problems: validado.problems };
  }

  try {
    const port = await getArPort();
    const { receivableId } = await port.createReceivable(validado.value);
    revalidatePath('/contas-a-receber');
    return { ok: true, data: { receivableId } };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Cancela um título — **a ação destrutiva deste módulo.**
 *
 * ⚠️ Cancelar é `status`, nunca `delete`. A confirmação em dois passos vive na
 * tela; esta ação é o segundo passo, e ela **reconfere** o ciclo de vida antes
 * de chamar a porta — botão escondido não é regra.
 */
export async function cancelReceivable(input: { receivableId: string }): Promise<ActionResult> {
  try {
    const port = await getArPort();
    const titulos = await port.loadReceivables();

    const titulo = titulos.find((t) => t.id === input.receivableId);
    if (!titulo) return { ok: false, message: 'Título não encontrado.' };

    if (!canTransition(titulo.status, 'cancelled')) {
      // A mensagem diz o CAMINHO, não só o "não".
      return {
        ok: false,
        message:
          titulo.status === 'received'
            ? 'Título recebido não se cancela: o dinheiro entrou na conta. Estorne o recebimento primeiro e cancele depois.'
            : 'Este título já está cancelado.',
      };
    }

    await port.updateStatus({ receivableId: input.receivableId, status: 'cancelled' });
    revalidatePath('/contas-a-receber');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/** Muda o estado por qualquer outro caminho do ciclo de vida. */
export async function changeReceivableStatus(input: {
  receivableId: string;
  to: ReceivableStatus;
}): Promise<ActionResult> {
  if (input.to === 'cancelled') return cancelReceivable({ receivableId: input.receivableId });

  try {
    const port = await getArPort();
    const titulos = await port.loadReceivables();
    const titulo = titulos.find((t) => t.id === input.receivableId);
    if (!titulo) return { ok: false, message: 'Título não encontrado.' };

    if (!canTransition(titulo.status, input.to)) {
      return { ok: false, message: 'Esta mudança de estado não existe no ciclo de vida.' };
    }

    await port.updateStatus({ receivableId: input.receivableId, status: input.to });
    revalidatePath('/contas-a-receber');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
