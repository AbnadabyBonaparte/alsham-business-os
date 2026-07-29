'use server';

import { revalidatePath } from 'next/cache';

import { canTransition, statusForSettlement, validateNewPayable } from '@alsham/accounts-payable';
import type { NewPayableInput, PayableStatus } from '@alsham/accounts-payable';

import { getApPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

/**
 * As Server Actions do Módulo 3.
 *
 * ⭐ **Leia o que elas fazem — e principalmente o que não fazem.**
 *
 * Não existe aqui um `if (!ref) return 'informe a referência'`, nem uma lista
 * de transições, nem a conta do que já foi liquidado. Tudo isso é
 * `validateNewPayable()` e `canTransition()`, no pacote. Esta camada faz três
 * coisas: pega o clique, pergunta ao domínio, e manda a porta gravar.
 *
 * É exatamente aqui que a Regra de Ouro escorrega na vida real — basta escrever
 * "o valor tem de ser positivo" *porque era mais rápido*. Há guarda no CI para
 * o dia em que alguém tentar.
 *
 * Quem autoriza é o **banco**: a policy exige `ap.payable.manage` para gravar, e
 * o trigger `ap.guard_status_transition()` recusa a passagem para `cancelled`
 * sem `ap.payable.cancel`. A tela esconder o botão é cortesia.
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

/**
 * Registra um título.
 *
 * ⭐ **Este é o clique que dispara o triângulo inteiro.** O `insert` acende o
 * trigger `payables_emit_registered`, que põe `ap.payable.registered` em
 * `core.event_outbox` **na mesma transação** — e o correio, um minuto depois,
 * projeta o título na mesa de conciliação do outro módulo. Ninguém redigita, e
 * nenhum dos dois módulos conhece o outro.
 */
export async function registerPayable(
  input: NewPayableInput,
): Promise<ActionResult<{ payableId: string }> | RegisterFailure> {
  const validado = validateNewPayable(input);
  if (!validado.ok) {
    return {
      ok: false,
      message: 'Confira os campos destacados.',
      problems: validado.problems,
    };
  }

  try {
    const port = await getApPort();
    const { payableId } = await port.createPayable(validado.value);
    revalidatePath('/contas-a-pagar');
    return { ok: true, data: { payableId } };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Cancela um título — **a ação destrutiva deste módulo.**
 *
 * ⚠️ Cancelar é `status`, nunca `delete`: o título continua no banco, e a
 * tabela não tem porta de DELETE nem por GRANT nem por policy. A confirmação em
 * dois passos vive na tela; esta ação é o segundo passo, e ela **reconfere** o
 * ciclo de vida antes de chamar a porta — botão escondido não é regra.
 */
export async function cancelPayable(input: { payableId: string }): Promise<ActionResult> {
  try {
    const port = await getApPort();
    const titulos = await port.loadPayables();

    const titulo = titulos.find((t) => t.id === input.payableId);
    if (!titulo) return { ok: false, message: 'Título não encontrado.' };

    if (!canTransition(titulo.status, 'cancelled')) {
      // A mensagem diz o CAMINHO, não só o "não". Um título liquidado se
      // estorna primeiro e se cancela depois — dois atos, dois registros.
      return {
        ok: false,
        message:
          titulo.status === 'settled'
            ? 'Título liquidado não se cancela. Estorne o pagamento primeiro e cancele depois.'
            : 'Este título já está cancelado.',
      };
    }

    await port.updateStatus({ payableId: input.payableId, status: 'cancelled' });
    revalidatePath('/contas-a-pagar');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/** Muda o estado de um título por qualquer outro caminho do ciclo de vida. */
export async function changePayableStatus(input: {
  payableId: string;
  to: PayableStatus;
}): Promise<ActionResult> {
  if (input.to === 'cancelled') return cancelPayable({ payableId: input.payableId });

  try {
    const port = await getApPort();
    const titulos = await port.loadPayables();
    const titulo = titulos.find((t) => t.id === input.payableId);
    if (!titulo) return { ok: false, message: 'Título não encontrado.' };

    if (!canTransition(titulo.status, input.to)) {
      return { ok: false, message: 'Esta mudança de estado não existe no ciclo de vida.' };
    }

    await port.updateStatus({ payableId: input.payableId, status: input.to });
    revalidatePath('/contas-a-pagar');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * ⭐ **REGISTRAR LIQUIDAÇÃO ou ESTORNAR — o botão que faltava.**
 *
 * ⚠️ **Por que ele ainda faz falta depois dos PRs #16/#17.** A liquidação
 * automática existe e está provada: confirmar um casamento na mesa emite
 * `recon.match.decided`, e `ap.apply_recon_match()` baixa o título sozinho.
 * Mas ela cobre **o pagamento que apareceu no extrato**. Este botão cobre o
 * resto do mundo real: o pagamento em dinheiro, o acerto por compensação, a
 * baixa parcial combinada por telefone — e o **estorno**, que nenhum extrato
 * traz.
 *
 * ⭐ Quem decide o estado resultante é `statusForSettlement()`, no pacote. E o
 * `delta` pode ser NEGATIVO: **estorno é lançamento**, não apagamento.
 */
export async function applyPayableSettlement(input: {
  payableId: string;
  deltaCents: number;
  method: string;
}): Promise<ActionResult> {
  if (!Number.isInteger(input.deltaCents) || input.deltaCents === 0) {
    return { ok: false, message: 'Informe um valor diferente de zero.' };
  }

  try {
    const port = await getApPort();
    const titulos = await port.loadPayables();
    const titulo = titulos.find((t) => t.id === input.payableId);
    if (!titulo) return { ok: false, message: 'Título não encontrado.' };

    const total = titulo.settledAmountCents + input.deltaCents;
    if (total < 0) {
      return {
        ok: false,
        message: 'O estorno é maior do que o valor já liquidado neste título.',
      };
    }

    const novo = statusForSettlement(titulo.amountCents, total, titulo.status);
    if (novo !== titulo.status && !canTransition(titulo.status, novo)) {
      return { ok: false, message: 'Esta mudança de estado não existe no ciclo de vida.' };
    }

    await port.applySettlement({
      payableId: input.payableId,
      settledAmountCents: total,
      status: novo,
      settlementMethod: input.method.trim().length > 0 ? input.method.trim() : null,
    });
    revalidatePath('/contas-a-pagar');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
