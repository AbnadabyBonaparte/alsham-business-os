'use server';

import { revalidatePath } from 'next/cache';

import { getDataPort, DataPortError } from '@/lib/data';

/**
 * As Server Actions do painel.
 *
 * ⭐ **Leia o que estas funções fazem — e principalmente o que não fazem.**
 *
 * Elas coletam o clique, chamam a porta de dados e devolvem o resultado. Não
 * calculam score, não decidem se o casamento é bom, não aplicam alçada, não
 * validam regra de negócio. É aqui que a Regra de Ouro mais escorrega — basta
 * escrever "se valor > X exige dois aprovadores" neste arquivo *porque era
 * mais rápido* — e é por isso que este comentário existe.
 *
 * Quem autoriza é o **banco**: as policies de `recon.approval_queue` e
 * `recon.reconciliation_matches` exigem a permissão. Se faltar, o UPDATE afeta
 * zero linhas e o adapter lança. A tela esconder o botão é cortesia; a policy
 * é a segurança.
 */

export type ActionResult = { ok: true } | { ok: false; message: string };

function toResult(err: unknown): ActionResult {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return {
    ok: false,
    message: 'Não foi possível registrar a decisão. Nada foi alterado.',
  };
}

/** Confirma ou rejeita um casamento sugerido — o "visto" digital. */
export async function decideMatchAction(
  matchId: string,
  decision: 'confirmed' | 'rejected',
): Promise<ActionResult> {
  try {
    await getDataPort().decideMatch({ matchId, decision });
    revalidatePath('/conciliacao');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/** Aprova ou rejeita um item da fila. Exige `recon.approval.decide` no banco. */
export async function decideApprovalAction(
  approvalId: string,
  decision: 'approved' | 'rejected',
  note?: string,
): Promise<ActionResult> {
  try {
    await getDataPort().decideApproval({ approvalId, decision, note });
    revalidatePath('/aprovacoes');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
