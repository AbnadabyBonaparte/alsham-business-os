import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { AI_METRIC } from '@alsham/ai';

import { verifyAnswer, type VerifyJudge, type VerifyInput } from './verify-service.ts';

/**
 * # A BANCA DE PROVA DO PORTÃO VERIFICADOR — contra Postgres de verdade
 *
 * O que estes testes provam, e nenhum teste de pacote alcança:
 *
 *   1. ⭐ **ponta a ponta pela composição do `apps/api`** — `verifyAnswer` monta
 *      o prompt (pacote), chama o motor-juiz, mede a geração e decide o portão;
 *   2. ⛔⛔ **FAIL-CLOSED de verdade** — um juiz que devolve LIXO (o modelo caiu
 *      no meio) NÃO deixa a resposta publicar. É a prova que o bastão pediu: o
 *      portão pega o erro, não o maquia;
 *   3. ⭐ **a geração vira registro** — cada verificação nasce uma linha em
 *      `core.ai_generations` com `source_module = 'engineer-verify'` (a mesma
 *      disciplina da Forja: nada sem contabilizar).
 *
 * ⚠️ O motor-juiz é **injetado** (`judge`): a prova roda no CI **sem chave real**,
 * com um juiz de mentira que devolve um veredito PLANTADO. Provar que o juiz de
 * verdade pega uma alucinação de verdade é a corrida do dono contra o motor
 * real (precisa de chave — como o apply, é ato dele). Aqui prova-se o ENCANAMENTO
 * e a LEI (fail-closed), que é o que se pode provar sem gastar geração paga.
 *
 * ⚠️ Exige `DATABASE_URL`. Sem ela, os testes são **pulados**, não fingidos.
 */

const URL_BANCO = process.env.DATABASE_URL;
const SEM_BANCO = !URL_BANCO;

const TENANT = '00000000-0000-4000-8000-0000000105b1';
const PLAN = 'verify-test-plan';

let pool: Pool;

/** Um juiz de mentira que devolve exatamente o texto plantado. */
function juizDizendo(output: string): VerifyJudge {
  return async () => ({ output, consumed: 1 });
}

const ENTRADA: Omit<VerifyInput, never> = {
  tenantId: TENANT,
  userId: null,
  question: 'Quantos títulos estão vencidos?',
  answer: 'Você tem 3 títulos vencidos somando BRL 1500.00.',
  groundedFacts: '3 títulos vencidos; total em aberto BRL 1500.00.',
  tenantName: 'Tenant da Banca',
};

/** Roda em modo demonstração: hasKey passa sem chave real; o juiz é sempre o injetado. */
function deps(judge: VerifyJudge) {
  return { pool, env: { ...process.env, ALSHAM_FORGE_DEMO: 'true' }, judge };
}

before(async () => {
  if (SEM_BANCO) return;
  pool = new Pool({ connectionString: URL_BANCO, max: 4 });

  await pool.query(
    `insert into core.tenants (id, slug, name, plan_code)
     values ($1, 'tenant-verify-banca', 'Tenant da Banca', $2)
     on conflict (id) do update set plan_code = excluded.plan_code`,
    [TENANT, PLAN],
  );
  // Um teto próprio para a métrica de IA — sem ele, `checkLimit()` negaria por
  // omissão (a lei do 0019) e a verificação nem começaria.
  await pool.query(
    `insert into core.plan_limits (plan_code, metric, limit_value, on_exceed)
     values ($1, $2, 100000, 'meter')
     on conflict (plan_code, metric) do update set limit_value = excluded.limit_value`,
    [PLAN, AI_METRIC],
  );
});

after(async () => {
  if (SEM_BANCO) return;
  await pool.end();
});

describe('o portão verificador na composição do apps/api', { skip: SEM_BANCO }, () => {
  test('juiz REPROVA (número inventado) → a resposta NÃO publica, e vira registro', async () => {
    const r = await verifyAnswer(
      deps(juizDizendo('{"verdict":"fail","reasons":["o número 4200 não está nos fatos"]}')),
      { ...ENTRADA, answer: 'Você tem 7 títulos vencidos somando BRL 4200.00.' },
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.publish, false, 'reprovado não publica');
    assert.equal(r.verdict.verdict, 'fail');

    // A geração virou linha — a disciplina "nada sem contabilizar".
    const { rows } = await pool.query<{ status: string; source_module: string }>(
      'select status, source_module from core.ai_generations where id = $1',
      [r.generationId],
    );
    assert.equal(rows[0]?.status, 'completed');
    assert.equal(rows[0]?.source_module, 'engineer-verify');
  });

  test('juiz APROVA → a resposta publica', async () => {
    const r = await verifyAnswer(deps(juizDizendo('{"verdict":"pass","reasons":[]}')), ENTRADA);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.publish, true);
    assert.equal(r.verdict.verdict, 'pass');
  });

  test('⛔ FAIL-CLOSED: juiz devolve LIXO → a resposta NÃO publica', async () => {
    const r = await verifyAnswer(deps(juizDizendo('o modelo caiu no meio da resposta {')), ENTRADA);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.publish, false, 'veredito ilegível bloqueia — nunca inventa OK');
    assert.equal(r.verdict.verdict, 'fail');
  });
});
