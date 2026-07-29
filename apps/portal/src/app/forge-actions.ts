'use server';

import { revalidatePath } from 'next/cache';

import { canGenerate, whyCannotGenerate } from '@alsham/ai';
import { nextVersion } from '@alsham/ops';
import type { EngineState, GenerationKind } from '@alsham/ai';

import { getForgePort, getOpsPort, DataPortError } from '@/lib/data';
import type { ActionResult } from './actions';

/**
 * As Server Actions da FORJA.
 *
 * ⭐ **Leia o que elas fazem — e principalmente o que não fazem.**
 *
 * Não existe aqui nenhuma chamada a motor, nenhuma chave, nenhum nome de
 * fornecedor. O portal **pede**; `apps/api` executa. É a mesma fronteira da
 * chave-mãe, e há guarda de CI sobre ela.
 *
 * ⭐ E a decisão de *se pode gerar* é `canGenerate()`, em `@alsham/ai` — a
 * mesma função que a tela usa para esconder o botão e que o servidor usa para
 * recusar. Uma regra, dois lugares que a consultam, zero cópias.
 */

function toResult(err: unknown): { ok: false; message: string } {
  if (err instanceof DataPortError) return { ok: false, message: err.message };
  return { ok: false, message: 'A geração não pôde ser concluída. Nada foi cobrado do seu plano.' };
}

/** O estado honesto da forja, para a tela decidir o que desenhar. */
export async function readForgeState(kind: GenerationKind): Promise<EngineState> {
  try {
    const port = await getForgePort();
    return await port.readEngineState(kind);
  } catch {
    // ⚠️ Estado indisponível NÃO é "pronto". Um erro de leitura que virasse
    // `ready` desenharia um botão que queima cota e falha.
    return { status: 'unconfigured', runbookSection: '§13' };
  }
}

/**
 * ⭐ **GERAR E REGISTRAR COMO ENTREGÁVEL — o ciclo inteiro da Etapa 14.**
 *
 * O operador pede numa etapa da esteira; o resultado entra como **versão de
 * entregável, marcada como rascunho de máquina**; e o humano decide — aprovar
 * (deixar como está), refazer (gerar de novo, que cria a versão seguinte) ou
 * descartar (registrar outra versão à mão).
 *
 * ⚠️ **A versão é calculada pelo pacote da esteira**, e o `unique` do banco é
 * quem garante que duas gerações simultâneas não criem duas "v2".
 */
export async function generateDeliverable(input: {
  orderId: string;
  kind: GenerationKind;
  deliverableKind: string;
  instruction: string;
}): Promise<ActionResult<{ output: string; violations: readonly string[]; demo: boolean }>> {
  if (input.instruction.trim().length === 0) {
    return { ok: false, message: 'Diga o que precisa ser produzido.' };
  }
  if (input.deliverableKind.trim().length === 0) {
    return { ok: false, message: 'Diga que tipo de entregável é este — "arte", "legenda", o que for.' };
  }

  try {
    const forge = await getForgePort();

    // Reconfere o estado ANTES de gastar: botão escondido não é regra.
    const estado = await forge.readEngineState(input.kind);
    if (!canGenerate(estado)) {
      return { ok: false, message: whyCannotGenerate(estado) ?? 'Geração indisponível.' };
    }

    const ops = await getOpsPort();
    const ordens = await ops.loadOrders();
    const os = ordens.find((o) => o.id === input.orderId);
    if (os === undefined) return { ok: false, message: 'Ordem de serviço não encontrada.' };

    const [{ deliverables }, esteiras] = await Promise.all([
      ops.loadOrderDetail(input.orderId),
      ops.loadPipelines(),
    ]);
    const etapa = esteiras
      .find((e) => e.pipeline.id === os.pipelineId)
      ?.stages.find((s) => s.id === os.currentStageId);

    const gerado = await forge.generate({
      kind: input.kind,
      instruction: input.instruction,
      // ⭐ O contexto do TRABALHO entra no pedido, junto com o Cérebro da
      // Marca que o servidor lê do banco. A tela não monta prompt.
      workContext: `${os.title}. ${os.description}`.trim(),
      sourceRef: input.orderId,
    });

    await ops.registerDeliverable({
      orderId: input.orderId,
      stageId: etapa?.id ?? null,
      stageName: etapa?.name ?? null,
      kind: input.deliverableKind.trim(),
      reference: gerado.output,
      version: nextVersion(deliverables, input.orderId, input.deliverableKind.trim()),
      // ⭐ A instrução já vem MARCADA como rascunho de máquina, do pacote.
      instruction: gerado.draftInstruction,
    });

    revalidatePath(`/esteira/${input.orderId}`);
    return {
      ok: true,
      data: { output: gerado.output, violations: gerado.violations, demo: gerado.demo },
    };
  } catch (err) {
    return toResult(err);
  }
}
