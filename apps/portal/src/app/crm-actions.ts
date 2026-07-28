'use server';

import { revalidatePath } from 'next/cache';

import { canTransition, validateNewInteraction, validateNewParty } from '@alsham/crm';
import type { NewInteractionInput, NewPartyInput, PartyStatus } from '@alsham/crm';

import { getCrmPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

/**
 * As Server Actions do Módulo 4.
 *
 * ⭐ **Leia o que elas fazem — e principalmente o que não fazem.**
 *
 * Não existe aqui um `if (!nome) return 'informe o nome'`, nem uma checagem de
 * formato de identificador, nem a lista de transições. Tudo isso é
 * `validateNewParty()`, `validateNewInteraction()` e `canTransition()`, no
 * pacote. Esta camada faz três coisas: pega o clique, pergunta ao domínio, e
 * manda a porta gravar.
 *
 * Quem autoriza é o **banco**: a policy exige `crm.party.manage` para gravar,
 * `crm.interaction.record` para registrar contato, e o trigger
 * `crm.guard_status_transition()` recusa a mudança de estado sem
 * `crm.party.archive`. A tela esconder o botão é cortesia.
 */

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

export interface FormFailure {
  readonly ok: false;
  readonly message: string;
  /** Os campos culpados, para o formulário saber onde pintar. */
  readonly problems?: readonly { field: string; message: string }[];
}

/** Cadastra uma contraparte. */
export async function registerParty(
  input: NewPartyInput,
): Promise<ActionResult<{ partyId: string }> | FormFailure> {
  const validado = validateNewParty(input);
  if (!validado.ok) {
    return { ok: false, message: 'Confira os campos destacados.', problems: validado.problems };
  }

  try {
    const port = await getCrmPort();
    const { partyId } = await port.createParty(validado.value);
    revalidatePath('/relacionamentos');
    return { ok: true, data: { partyId } };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Edita o cadastro.
 *
 * ⚠️ **Não muda estado.** Editar e arquivar são atos diferentes, com permissões
 * diferentes — e a porta nem manda `status` no `update`, para o trigger de
 * permissão não disparar em toda correção de telefone.
 */
export async function updatePartyDetails(
  input: NewPartyInput & { partyId: string },
): Promise<ActionResult | FormFailure> {
  const validado = validateNewParty(input);
  if (!validado.ok) {
    return { ok: false, message: 'Confira os campos destacados.', problems: validado.problems };
  }

  try {
    const port = await getCrmPort();
    await port.updateParty({ partyId: input.partyId, party: validado.value });
    revalidatePath('/relacionamentos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Arquiva ou traz de volta — **a ação destrutiva deste módulo.**
 *
 * ⚠️ Arquivar é `status`, nunca `delete`: a contraparte continua no banco com o
 * histórico inteiro, e as tabelas não têm porta de DELETE. A confirmação em
 * dois passos vive na tela; esta ação é o segundo passo, e ela **reconfere** o
 * ciclo de vida antes de chamar a porta — botão escondido não é regra.
 */
export async function changePartyStatus(input: {
  partyId: string;
  to: PartyStatus;
}): Promise<ActionResult> {
  try {
    const port = await getCrmPort();
    const parties = await port.loadParties();

    const party = parties.find((p) => p.id === input.partyId);
    if (!party) return { ok: false, message: 'Contraparte não encontrada.' };

    if (!canTransition(party.status, input.to)) {
      return { ok: false, message: 'Esta mudança de estado não existe no ciclo de vida.' };
    }

    await port.updateStatus({ partyId: input.partyId, status: input.to });
    revalidatePath('/relacionamentos');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Registra um contato no histórico.
 *
 * ⚠️ **Não existe editar nem apagar interação, e não é esquecimento.** Fato
 * consumado não se edita: se o registro saiu errado, a correção é registrar
 * outro dizendo o que se corrigiu — como um livro-caixa se corrige com
 * estorno, nunca com borracha. O banco recusa em três camadas.
 */
export async function recordInteraction(
  input: NewInteractionInput,
): Promise<ActionResult<{ interactionId: string }> | FormFailure> {
  const validado = validateNewInteraction(input);
  if (!validado.ok) {
    return { ok: false, message: 'Confira os campos destacados.', problems: validado.problems };
  }

  try {
    const port = await getCrmPort();
    const { interactionId } = await port.recordInteraction(validado.value);
    revalidatePath('/relacionamentos');
    return { ok: true, data: { interactionId } };
  } catch (err) {
    return toResult(err);
  }
}
