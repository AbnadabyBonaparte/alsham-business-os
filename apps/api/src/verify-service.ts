import { AI_METRIC, canGenerate, whyCannotGenerate } from '@alsham/ai';
import type { GenerationKind } from '@alsham/ai';
import { periodOf } from '@alsham/billing';
import { buildVerifierPrompt, parseVerdict, decideGate } from '@alsham/engineer';
import type { VerifierInput, VerifierVerdict } from '@alsham/engineer';

import { adapterFor, safeFailureReason } from './forge-adapters.ts';
import { isDemoMode, readEngineState } from './forge-service.ts';
import type { ForgeDeps } from './forge-service.ts';

/**
 * **O SERVIÇO DO PORTÃO VERIFICADOR** — a composição do juiz de fidelidade.
 *
 * ⭐ É o I/O do portão: monta o prompt (no `@alsham/engineer`, puro), **chama o
 * motor exatamente como a Forja** (com medição no `usage_ledger`), lê o veredito
 * (puro) e decide (puro). A decisão vive no pacote; aqui só o encanamento.
 *
 * ⚖️ **A MESMA disciplina da Forja, e pela mesma razão:** nenhuma verificação
 * acontece sem estar contabilizada. O juiz é uma SEGUNDA geração — se ela não
 * virasse linha no `usage_ledger`, seria custo invisível (a lei do `0019`).
 *
 * ⛔ **NÃO liga o portão na rota viva do Engenheiro.** Esta é a BANCA DE PROVA
 * do bastão: provar, medido e ponta-a-ponta, que um juiz que reprova (ou que
 * devolve lixo) NÃO deixa a resposta publicar. Gatear a resposta de cliente de
 * verdade é o próximo clique do dono. Por isso o `judge` é injetável: a prova
 * roda no CI sem chave real, com um juiz de mentira que devolve um veredito
 * plantado.
 */

/** A assinatura do motor-juiz — a mesma do adaptador da Forja. Injetável na prova. */
export type VerifyJudge = (
  prompt: string,
  env: NodeJS.ProcessEnv,
) => Promise<{ output: string; consumed: number }>;

export interface VerifyDeps extends ForgeDeps {
  /**
   * ⭐ O motor que julga. **Ausente em produção** → o adaptador de texto real
   * (a mesma chave da Forja). **Presente na banca de prova** → um juiz de
   * mentira com veredito plantado, para provar o portão sem tocar o motor.
   */
  readonly judge?: VerifyJudge;
}

export interface VerifyInput extends VerifierInput {
  readonly tenantId: string;
  readonly userId: string | null;
}

export type VerifyOutcome =
  | {
      readonly ok: true;
      readonly generationId: string;
      readonly verdict: VerifierVerdict;
      /** A decisão do portão: `true` publica, `false` troca por "não pude confirmar". */
      readonly publish: boolean;
      readonly demo: boolean;
    }
  | { readonly ok: false; readonly reason: string };

/** O juiz é uma geração de TEXTO — a mesma métrica e o mesmo teto da Forja. */
const VERIFY_KIND: GenerationKind = 'text';

/**
 * ⭐ **VERIFICAR.** Chama o motor-juiz, mede, e devolve o veredito + o portão.
 *
 * A ordem é a da Forja, e existe pela mesma razão (nada sem contabilizar):
 * 1. lê o estado (plano, consumo, chave) → se não pode gerar, para aqui;
 * 2. monta o prompt do juiz (puro, no pacote);
 * 3. grava `requested` ANTES de chamar — rastro se o processo morrer no meio;
 * 4. chama o juiz;
 * 5. grava `completed` **e** o lançamento no `usage_ledger`, na mesma transação;
 * 6. lê o veredito (fail-closed) e decide o portão.
 */
export async function verifyAnswer(deps: VerifyDeps, input: VerifyInput): Promise<VerifyOutcome> {
  const now = new Date();
  const demoMode = isDemoMode(deps.env);

  // (1) O mesmo cinto da Forja: sem estado bom, nada é gravado nem cobrado.
  const estado = await readEngineState(deps, input.tenantId, VERIFY_KIND, now);
  if (!canGenerate(estado)) {
    return { ok: false, reason: whyCannotGenerate(estado) ?? 'Verificação indisponível.' };
  }

  // (2) O prompt do juiz — puro, no pacote. Regra output-only: sem raciocínio.
  const prompt = buildVerifierPrompt({
    question: input.question,
    answer: input.answer,
    groundedFacts: input.groundedFacts,
    tenantName: input.tenantName,
  });

  // O motor-juiz: injetado (banca de prova) ou o adaptador real de texto.
  const base = adapterFor(VERIFY_KIND, demoMode);
  const runJudge: VerifyJudge = deps.judge ?? base.generate.bind(base);
  const adapterId = deps.judge ? 'verify-injected' : base.id;

  // (3) O registro nasce ANTES da chamada. `source_module` marca de onde veio.
  const { rows: criada } = await deps.pool.query<{ id: string }>(
    `insert into core.ai_generations
       (tenant_id, kind, status, adapter_id, prompt, prompt_length, source_module, source_ref, created_by, is_mock)
     values ($1, $2, 'requested', $3, $4, $5, 'engineer-verify', $6, $7, $8)
     returning id`,
    [input.tenantId, VERIFY_KIND, adapterId, prompt, prompt.length, input.userId, input.userId, demoMode],
  );
  const generationId = criada[0]!.id;

  // (4) A chamada ao motor.
  let saida: { output: string; consumed: number };
  try {
    saida = await runJudge(prompt, deps.env);
  } catch (erro) {
    const razao = safeFailureReason(erro);
    console.error('[verificador] falha ao chamar o juiz', { generationId, adapterId, erro });
    await deps.pool.query(
      `update core.ai_generations set status = 'failed', failure_reason = $2, finished_at = now() where id = $1`,
      [generationId, razao],
    );
    return { ok: false, reason: razao };
  }

  // (5) Resultado e consumo, na MESMA transação (a lei do 0019: nunca um sem o outro).
  const cliente = await deps.pool.connect();
  try {
    await cliente.query('begin');
    await cliente.query(
      `update core.ai_generations set status = 'completed', consumed = $2, finished_at = now() where id = $1`,
      [generationId, saida.consumed],
    );
    if (!demoMode) {
      await cliente.query(
        `insert into core.usage_ledger (tenant_id, metric, quantity, period, source_module_id, source_ref)
         values ($1, $2, $3, $4, $5, $6) on conflict do nothing`,
        [input.tenantId, AI_METRIC, saida.consumed, periodOf(now), adapterId, generationId],
      );
    }
    await cliente.query('commit');
  } catch (erro) {
    await cliente.query('rollback');
    throw erro;
  } finally {
    cliente.release();
  }

  // (6) O veredito (fail-closed) e o portão. O prompt/dado NÃO saem daqui —
  // o veredito volta ao chamador; a persistência de auditoria é clique futuro.
  const verdict = parseVerdict(saida.output);
  const { publish } = decideGate(verdict);
  return { ok: true, generationId, verdict, publish, demo: demoMode };
}
