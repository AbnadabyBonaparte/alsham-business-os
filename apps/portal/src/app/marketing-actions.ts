'use server';

import { revalidatePath } from 'next/cache';

import { budgetStatusFor, planTransition } from '@alsham/marketing';
import type { CampaignStatus } from '@alsham/marketing';

import { getMarketingPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

/**
 * As Server Actions do Módulo 2.
 *
 * ⭐ **Leia o que elas fazem — e principalmente o que não fazem.**
 *
 * Não existe aqui um `if (status === 'draft')`, nem uma lista de transições,
 * nem a regra de exigir verba. Tudo isso é `planTransition()`, no pacote. Esta
 * camada faz três coisas: pega o clique, pergunta ao motor, e manda a porta
 * gravar o que o motor carimbou.
 *
 * É exatamente aqui que a Regra de Ouro escorrega na vida real — basta
 * escrever "só publica se tiver verba" *porque era mais rápido*. Há guarda no
 * CI para o dia em que alguém tentar.
 *
 * Quem autoriza é o **banco**: a policy exige a permissão, e o trigger
 * `campaigns_guard_publish` recusa a passagem para `published` sem
 * `marketing.campaign.publish`. A tela esconder o botão é cortesia.
 */

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'Não foi possível concluir a operação. Nada foi alterado.' };
}

/** Cria um rascunho. Rascunho não emite evento — trabalho interno não é fato. */
export async function createCampaignDraft(input: {
  name: string;
  description: string;
  audienceNote: string;
  scheduledFor: string | null;
  budgetPlannedCents: number | null;
  currency: string | null;
  budgetRef: string | null;
}): Promise<ActionResult<{ campaignId: string }>> {
  try {
    const port = await getMarketingPort();
    const { campaignId } = await port.createDraft(input);
    revalidatePath('/campanhas');
    return { ok: true, data: { campaignId } };
  } catch (err) {
    return toResult(err);
  }
}

/**
 * Muda o estado de uma campanha — publicar, encerrar, cancelar, agendar.
 *
 * ⚠️ O `now` é criado aqui, no servidor, e passado ao motor. Nunca vem do
 * cliente: relógio de cliente é relógio que o cliente ajusta, e a regra de
 * agendamento depende dele.
 */
export async function changeCampaignStatus(input: {
  campaignId: string;
  to: CampaignStatus;
}): Promise<ActionResult> {
  try {
    const port = await getMarketingPort();
    const [campanhas, settings, aprovacoes] = await Promise.all([
      port.loadCampaigns(),
      port.loadSettings(),
      port.loadSpendApprovals(),
    ]);

    const campanha = campanhas.find((c) => c.id === input.campaignId);
    if (!campanha) return { ok: false, message: 'Campanha não encontrada.' };

    // A decisão de verba pode ter chegado ANTES desta campanha existir — e,
    // nesse caso, a coluna `budget_status` da linha nunca foi carimbada.
    // Consultar a projeção fecha essa janela sem que o correio precise
    // reprocessar nada.
    const projetado = budgetStatusFor(campanha.budgetRef, aprovacoes);
    const budgetStatus = campanha.budgetStatus === 'none' ? projetado : campanha.budgetStatus;

    const veredito = planTransition({
      campaign: { ...campanha, budgetStatus },
      to: input.to,
      now: new Date(),
      settings,
    });

    if (!veredito.allowed) {
      return { ok: false, message: veredito.refusal.message };
    }

    await port.applyTransition({ campaignId: input.campaignId, ...veredito.stamps });
    revalidatePath('/campanhas');
    return { ok: true };
  } catch (err) {
    return toResult(err);
  }
}
