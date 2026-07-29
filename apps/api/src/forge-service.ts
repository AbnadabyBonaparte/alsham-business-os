import type { Pool } from 'pg';

import {
  AI_METRIC,
  canGenerate,
  composePrompt,
  engineState,
  findViolations,
  generationEventPayload,
  machineDraftInstruction,
  validateRequest,
  whyCannotGenerate,
} from '@alsham/ai';
import type { BrandContext, GenerationKind, GenerationRequest } from '@alsham/ai';
import { checkLimit, periodOf } from '@alsham/billing';
import type { PlanLimit } from '@alsham/billing';

import { adapterFor, hasKeyFor, safeFailureReason } from './forge-adapters.ts';

/**
 * **O SERVIÇO DA FORJA** — a composição da IA Base.
 *
 * ⭐ **É aqui, e só aqui, que a chave do motor encosta no pedido.** Roda em
 * `apps/api`, com `service_role`; o portal pede por HTTP e recebe o resultado
 * traduzido. É a mesma fronteira da chave-mãe, e há guarda de CI sobre ela.
 *
 * ⭐ **E é aqui que a Regra de Ouro fica visível pelo que este arquivo NÃO
 * faz:** ele não decide se pode gerar (`engineState`), não monta o prompt
 * (`composePrompt`), não confere a marca (`findViolations`) e não escreve a
 * instrução do rascunho (`machineDraftInstruction`). Tudo isso é `@alsham/ai`.
 * O que ele faz é I/O: ler o banco, chamar o motor, gravar o resultado.
 *
 * A ordem das operações é a decisão deste arquivo, e ela existe para que
 * **nenhuma geração aconteça sem estar contabilizada**:
 *
 * 1. valida o pedido;
 * 2. lê plano, consumo e chave → decide o estado;
 * 3. ⭐ **grava `requested` ANTES de chamar o motor** — se o processo morrer no
 *    meio, fica o registro de que se tentou, e o operador vê;
 * 4. chama o motor;
 * 5. grava `completed` **e** o lançamento no `usage_ledger`, na mesma
 *    transação. Consumo e resultado não podem existir um sem o outro;
 * 6. emite o fato.
 */

export interface ForgeDeps {
  readonly pool: Pool;
  readonly env: NodeJS.ProcessEnv;
  /** Seção do runbook citada quando falta chave. */
  readonly runbookSection?: string;
}

export interface ForgeInput {
  readonly tenantId: string;
  readonly userId: string | null;
  readonly kind: GenerationKind;
  readonly instruction: string;
  readonly workContext: string;
  /** De onde veio o pedido. Texto livre — hoje é a esteira. */
  readonly sourceModule?: string;
  readonly sourceRef?: string;
}

export type ForgeOutcome =
  | {
      readonly ok: true;
      readonly generationId: string;
      readonly output: string;
      /** A instrução a gravar na versão do entregável, já marcada. */
      readonly draftInstruction: string;
      readonly violations: readonly string[];
      readonly demo: boolean;
    }
  | { readonly ok: false; readonly reason: string };

/** `ALSHAM_FORGE_DEMO === 'true'` — e nada mais liga o mock. */
export function isDemoMode(env: NodeJS.ProcessEnv): boolean {
  return env.ALSHAM_FORGE_DEMO === 'true';
}

/**
 * O estado da forja para um tenant — o que a tela pergunta antes de desenhar
 * o botão.
 */
export async function readEngineState(
  deps: ForgeDeps,
  tenantId: string,
  kind: GenerationKind,
  now: Date,
) {
  const demoMode = isDemoMode(deps.env);
  const { limit, used } = await lerPlanoEConsumo(deps.pool, tenantId, now);

  return engineState({
    demoMode,
    hasKey: hasKeyFor(kind, deps.env, demoMode),
    verdict: checkLimit({ limit, used, quantity: 1 }),
    runbookSection: deps.runbookSection ?? '§12',
  });
}

/** Plano do tenant, teto da métrica e consumo do período — três leituras. */
async function lerPlanoEConsumo(
  pool: Pool,
  tenantId: string,
  now: Date,
): Promise<{ limit: PlanLimit | null; used: number }> {
  const { rows: tenant } = await pool.query<{ plan_code: string }>(
    'select plan_code from core.tenants where id = $1',
    [tenantId],
  );
  const plano = tenant[0]?.plan_code;
  if (plano === undefined) return { limit: null, used: 0 };

  const { rows: teto } = await pool.query<{ limit_value: string | null; on_exceed: string }>(
    'select limit_value, on_exceed from core.plan_limits where plan_code = $1 and metric = $2',
    [plano, AI_METRIC],
  );

  const { rows: consumo } = await pool.query<{ total: string }>(
    `select coalesce(sum(quantity), 0)::text as total
       from core.usage_ledger
      where tenant_id = $1 and metric = $2 and period = $3`,
    [tenantId, AI_METRIC, periodOf(now)],
  );

  const linha = teto[0];
  return {
    // ⚠️ `null` quando o par plano/métrica não existe — e `checkLimit()` nega
    // por omissão. É o "sem medição, sem geração" nascendo de um SELECT vazio.
    limit:
      linha === undefined
        ? null
        : {
            planCode: plano,
            metric: AI_METRIC,
            limit: linha.limit_value === null ? null : Number(linha.limit_value),
            onExceed: linha.on_exceed === 'meter' ? 'meter' : 'block',
          },
    used: Number(consumo[0]?.total ?? '0'),
  };
}

/** O Cérebro da Marca do tenant. Sem linha, contexto vazio — nunca erro. */
async function lerMarca(pool: Pool, tenantId: string): Promise<BrandContext> {
  const { rows } = await pool.query<{ identity: string; tone: string; forbidden: string[] }>(
    'select identity, tone, forbidden from core.ai_brand_context where tenant_id = $1',
    [tenantId],
  );
  const linha = rows[0];
  return {
    identity: linha?.identity ?? '',
    tone: linha?.tone ?? '',
    forbidden: linha?.forbidden ?? [],
  };
}

/**
 * ⭐ **GERAR.** A única função que chama o motor.
 */
export async function generate(deps: ForgeDeps, input: ForgeInput): Promise<ForgeOutcome> {
  const now = new Date();
  const demoMode = isDemoMode(deps.env);

  const marca = await lerMarca(deps.pool, input.tenantId);
  const pedido: GenerationRequest = {
    kind: input.kind,
    instruction: input.instruction,
    workContext: input.workContext,
    brand: marca,
  };

  const invalido = validateRequest(pedido);
  if (invalido !== null) return { ok: false, reason: invalido };

  const { limit, used } = await lerPlanoEConsumo(deps.pool, input.tenantId, now);
  const estado = engineState({
    demoMode,
    hasKey: hasKeyFor(input.kind, deps.env, demoMode),
    verdict: checkLimit({ limit, used, quantity: 1 }),
    runbookSection: deps.runbookSection ?? '§12',
  });

  if (!canGenerate(estado)) {
    // ⛔ Sem estado bom, **nada é gravado**: nem geração, nem consumo, nem
    // fato. Uma tentativa que o produto recusou não é um fato do tenant.
    return { ok: false, reason: whyCannotGenerate(estado) ?? 'Geração indisponível.' };
  }

  const prompt = composePrompt(pedido);
  const adaptador = adapterFor(input.kind, demoMode);

  // (3) O registro nasce ANTES da chamada.
  const { rows: criada } = await deps.pool.query<{ id: string }>(
    `insert into core.ai_generations
       (tenant_id, kind, status, adapter_id, prompt, prompt_length, source_module, source_ref, created_by)
     values ($1, $2, 'requested', $3, $4, $5, $6, $7, $8)
     returning id`,
    [
      input.tenantId,
      input.kind,
      adaptador.id,
      // ⚠️ O prompt fica AQUI, com RLS, e nunca no evento. CORE-SPEC §4.
      prompt,
      prompt.length,
      input.sourceModule ?? null,
      input.sourceRef ?? null,
      input.userId,
    ],
  );
  const generationId = criada[0]!.id;

  await emitirFato(deps.pool, input.tenantId, {
    generationId,
    kind: input.kind,
    status: 'requested',
    promptLength: prompt.length,
  });

  let saida: { output: string; consumed: number };
  try {
    saida = await adaptador.generate(prompt, deps.env);
  } catch (erro) {
    // ⚖️ A mensagem é NORMALIZADA antes de qualquer coisa sair: o erro cru do
    // fornecedor cita o nome dele. O cru fica no log do servidor.
    const razao = safeFailureReason(erro);
    console.error('[forja] falha na geração', { generationId, adapter: adaptador.id, erro });

    await deps.pool.query(
      `update core.ai_generations
          set status = 'failed', failure_reason = $2, finished_at = now()
        where id = $1`,
      [generationId, razao],
    );
    await emitirFato(deps.pool, input.tenantId, {
      generationId,
      kind: input.kind,
      status: 'failed',
      promptLength: prompt.length,
      failureReason: razao,
    });
    return { ok: false, reason: razao };
  }

  const violations = findViolations(saida.output, marca.forbidden);

  // (5) Resultado e consumo, na MESMA transação.
  //
  // ⭐ Separá-los deixaria acontecer o pior par possível: a geração gravada e o
  // consumo não — que é o produto entregando de graça e ninguém percebendo até
  // a fatura de infraestrutura.
  //
  // ⚠️ **Em modo demonstração o consumo NÃO é lançado.** É a mesma decisão do
  // `usage_ledger.is_mock` do kraken: custo de laboratório contamina o
  // relatório de margem, que é a razão de existir do livro-caixa.
  const cliente = await deps.pool.connect();
  try {
    await cliente.query('begin');
    await cliente.query(
      `update core.ai_generations
          set status = 'completed', consumed = $2, violations = $3, finished_at = now()
        where id = $1`,
      [generationId, saida.consumed, violations],
    );
    if (!demoMode) {
      await cliente.query(
        `insert into core.usage_ledger (tenant_id, metric, quantity, period, source_module_id, source_ref)
         values ($1, $2, $3, $4, $5, $6)
         on conflict do nothing`,
        [
          input.tenantId,
          AI_METRIC,
          saida.consumed,
          periodOf(now),
          // ⚖️ INTERNO: o adaptador vai para o livro-caixa, e é o que torna o
          // custo por motor calculável (o bake-off). Nunca para a tela.
          adaptador.id,
          generationId,
        ],
      );
    }
    await cliente.query('commit');
  } catch (erro) {
    await cliente.query('rollback');
    throw erro;
  } finally {
    cliente.release();
  }

  await emitirFato(deps.pool, input.tenantId, {
    generationId,
    kind: input.kind,
    status: 'completed',
    promptLength: prompt.length,
    consumed: demoMode ? 0 : saida.consumed,
    violations,
  });

  return {
    ok: true,
    generationId,
    output: saida.output,
    draftInstruction: machineDraftInstruction({ instruction: input.instruction, violations }),
    violations,
    demo: demoMode,
  };
}

/**
 * Emite o fato pela porta do Core.
 *
 * ⭐ O payload sai de `generationEventPayload()`, no pacote — e é ele que
 * garante que o prompt e o adaptador não entrem. A função SQL faz a mesma
 * conferência do outro lado, de propósito: as duas portas do envelope são
 * estreitas.
 */
async function emitirFato(
  pool: Pool,
  tenantId: string,
  input: Parameters<typeof generationEventPayload>[0],
): Promise<void> {
  const payload = generationEventPayload(input);
  await pool.query(
    `select core.emit_generation_event($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      tenantId,
      payload.generationId,
      input.status,
      payload.kind,
      payload.metric,
      payload.promptLength,
      input.status === 'completed' ? (input.consumed ?? 0) : null,
      input.status === 'completed' ? [...(input.violations ?? [])] : null,
      input.status === 'failed' ? (payload.failureReason as string) : null,
    ],
  );
}
