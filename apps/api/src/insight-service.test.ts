import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { runInsightOnce, AR_OVERDUE_KIND } from './insight-service.ts';

/**
 * # O OBSERVADOR PROATIVO CONTRA POSTGRES DE VERDADE
 *
 * O que estes testes provam e nenhum teste de pacote alcança:
 *
 *   1. ⭐ **rodando sozinho, ele lê o que já existe e ESCREVE um aviso** — os
 *      recebíveis vencidos viram uma linha em `core.tenant_insights`, com o
 *      número verdadeiro por trás (a prova de cognição proativa do Memorando);
 *   2. ⭐ **por MOEDA** — somar centavos de moedas diferentes seria mentira, e o
 *      aviso é um por (tenant, tipo, moeda);
 *   3. ⭐⭐ **quando o problema some, o aviso some** — recompute-e-substitui:
 *      pagar/quitar os vencidos apaga a linha, o quadro nunca mente sobre o hoje;
 *   4. ⛔ **módulo não instalado ⇒ tenant não avaliado** — a honestidade do
 *      Painel (sem cartão fabricado).
 *
 * ⚠️ Exige `DATABASE_URL`. Sem ela, os testes são **pulados**, não fingidos.
 */

const URL_BANCO = process.env.DATABASE_URL;
const SEM_BANCO = !URL_BANCO;

const TENANT_AR = '00000000-0000-4000-8000-0000000105a1';
const TENANT_SEM_AR = '00000000-0000-4000-8000-0000000105a2';

let pool: Pool;

before(async () => {
  if (SEM_BANCO) return;
  pool = new Pool({ connectionString: URL_BANCO, max: 4 });

  await pool.query(
    `insert into core.tenants (id, slug, name, plan_code) values
       ($1, 'tenant-insight-ar',  'Tenant com AR',  'pro'),
       ($2, 'tenant-insight-sem', 'Tenant sem AR',  'pro')
     on conflict (id) do nothing`,
    [TENANT_AR, TENANT_SEM_AR],
  );

  // Só o primeiro instala o Módulo 5 (ar). O segundo existe para provar que
  // quem não instalou não é avaliado.
  await pool.query(
    `insert into core.tenant_modules (tenant_id, module_id, version, status)
     values ($1, 'ar', '0.1.0', 'active')
     on conflict (tenant_id, module_id) do nothing`,
    [TENANT_AR],
  );
});

after(async () => {
  if (SEM_BANCO) return;
  await pool.end();
});

beforeEach(async () => {
  if (SEM_BANCO) return;
  await pool.query('delete from ar.receivables where tenant_id = any($1)', [
    [TENANT_AR, TENANT_SEM_AR],
  ]);
  await pool.query('delete from core.tenant_insights where tenant_id = any($1)', [
    [TENANT_AR, TENANT_SEM_AR],
  ]);
});

/** Insere um recebível cru (como dono do banco, contornando RLS — é montagem). */
async function semear(
  tenant: string,
  ref: string,
  dueOffsetDays: number,
  amountCents: number,
  currency: string,
  opts: { received?: number; status?: string } = {},
): Promise<void> {
  await pool.query(
    `insert into ar.receivables
       (tenant_id, external_ref, due_date, amount_cents, received_amount_cents, currency, status)
     values ($1, $2, current_date + ($3)::int, $4, $5, $6, $7)`,
    [
      tenant,
      ref,
      dueOffsetDays,
      amountCents,
      opts.received ?? 0,
      currency,
      opts.status ?? 'open',
    ],
  );
}

async function avisos(tenant: string): Promise<
  { kind: string; subject_key: string; headline: string; metric_value: string; amount_cents: string }[]
> {
  const { rows } = await pool.query(
    `select kind, subject_key, headline, metric_value, amount_cents
       from core.tenant_insights where tenant_id = $1 order by subject_key`,
    [tenant],
  );
  return rows as never;
}

describe('⭐ o observador proativo', { skip: SEM_BANCO }, () => {
  test('lê os vencidos que já existem e escreve UM aviso, com o número verdadeiro', async () => {
    await semear(TENANT_AR, 'r-venc-1', -10, 100_000, 'BRL'); // vencido há 10 dias
    await semear(TENANT_AR, 'r-venc-2', -30, 50_000, 'BRL'); // vencido há 30 dias (o mais antigo)
    await semear(TENANT_AR, 'r-futuro', +10, 999_999, 'BRL'); // ainda não venceu — fora
    await semear(TENANT_AR, 'r-quitado', -5, 20_000, 'BRL', {
      received: 20_000,
      status: 'received',
    }); // já recebido — fora

    const relatorio = await runInsightOnce(pool);
    assert.ok(relatorio.tenantsEvaluated >= 1, 'ao menos o tenant com AR foi avaliado');

    const linhas = await avisos(TENANT_AR);
    assert.equal(linhas.length, 1, 'um aviso, na moeda BRL');
    assert.equal(linhas[0]!.kind, AR_OVERDUE_KIND);
    assert.equal(linhas[0]!.subject_key, 'BRL');
    assert.equal(Number(linhas[0]!.metric_value), 2, '2 vencidos — o futuro e o quitado ficaram fora');
    assert.equal(Number(linhas[0]!.amount_cents), 150_000, 'o que falta receber: 100k + 50k');
    assert.match(linhas[0]!.headline, /2 títulos vencidos/);
  });

  test('⭐ por moeda: dois avisos, um recorte cada — nunca soma moedas', async () => {
    await semear(TENANT_AR, 'r-brl', -3, 40_000, 'BRL');
    await semear(TENANT_AR, 'r-usd', -7, 8_000, 'USD');

    await runInsightOnce(pool);

    const linhas = await avisos(TENANT_AR);
    assert.equal(linhas.length, 2);
    assert.deepEqual(
      linhas.map((l) => l.subject_key),
      ['BRL', 'USD'],
    );
  });

  test('⭐⭐ quando o problema some, o aviso some (recompute-e-substitui)', async () => {
    await semear(TENANT_AR, 'r-some', -15, 30_000, 'BRL');
    await runInsightOnce(pool);
    assert.equal((await avisos(TENANT_AR)).length, 1, 'primeiro há aviso');

    // O título é quitado — o problema deixou de existir.
    await pool.query(
      `update ar.receivables set received_amount_cents = amount_cents, status = 'received'
        where tenant_id = $1 and external_ref = 'r-some'`,
      [TENANT_AR],
    );

    await runInsightOnce(pool);
    assert.equal(
      (await avisos(TENANT_AR)).length,
      0,
      'o aviso foi apagado — o quadro não mente sobre o presente',
    );
  });

  test('⛔ módulo AR não instalado ⇒ tenant não é avaliado (sem aviso fabricado)', async () => {
    // O tenant sem AR tem recebível vencido no banco, mas não instalou o módulo.
    await semear(TENANT_SEM_AR, 'r-orfao', -20, 77_000, 'BRL');

    await runInsightOnce(pool);

    assert.equal(
      (await avisos(TENANT_SEM_AR)).length,
      0,
      'sem o Módulo 5 instalado, o observador não avalia — e não inventa aviso',
    );
  });
});
