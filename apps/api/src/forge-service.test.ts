import { test, before, after, beforeEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { AI_METRIC } from '@alsham/ai';

import { generate, isDemoMode, readEngineState } from './forge-service.ts';
import { adapterFor, hasKeyFor, safeFailureReason } from './forge-adapters.ts';
import { handleRequest } from './handler.ts';

/**
 * # A FORJA CONTRA POSTGRES DE VERDADE
 *
 * ⛔ **NENHUMA CHAVE DE MOTOR ENTRA AQUI, e nenhuma chamada de rede acontece.**
 *
 * O modo demonstração é o que permite provar o caminho inteiro — pedido,
 * medição, evento, marca — sem tocar em fornecedor nenhum. Um teste que
 * exigisse chave seria um teste que nunca roda no CI, e um teste que nunca
 * roda é uma garantia que não existe.
 *
 * O que estes testes provam e nenhum teste de pacote alcança:
 *
 *   1. ⭐ **sem medição, sem geração** — contra o `plan_limits` de verdade;
 *   2. ⭐ **a geração e o consumo nascem juntos**, na mesma transação;
 *   3. ⭐ **em modo demonstração o consumo NÃO é lançado** — laboratório não
 *      contamina o livro-caixa;
 *   4. ⛔ **o prompt fica na tabela e NUNCA no evento**;
 *   5. ⛔ **o endpoint da forja exige o segredo DELE**, não o do correio.
 *
 * ⚠️ Exige `DATABASE_URL`. Sem ela, os testes são **pulados**, não fingidos.
 *
 * ⛔ **E os arquivos de teste desta pasta rodam em SÉRIE** (`test:api` usa
 * `--test-concurrency=1`). Não é preferência: o `outbox-store.test.ts` limpa a
 * caixa de saída INTEIRA no `beforeEach`, de propósito e com a razão escrita lá
 * — o correio é da plataforma e pega tudo que estiver vencido. Rodando em
 * paralelo, aquela limpeza apagava os fatos que este arquivo acabara de emitir,
 * e as duas suítes falhavam alternadamente. Descoberto na primeira execução
 * conjunta.
 */

const URL_BANCO = process.env.DATABASE_URL;
const SEM_BANCO = !URL_BANCO;

const TENANT_PRO = '00000000-0000-4000-8000-00000000f04a';
const TENANT_SEM_METRICA = '00000000-0000-4000-8000-00000000f04b';

/** ⛔ Nenhuma chave real. `demo` liga o mock, e o mock não fala com ninguém. */
const ENV_DEMO: NodeJS.ProcessEnv = { ALSHAM_FORGE_DEMO: 'true' };
const ENV_SEM_CHAVE: NodeJS.ProcessEnv = {};
const ENV_COM_CHAVE_FALSA: NodeJS.ProcessEnv = {
  // Valor obviamente falso: o teste nunca chega a usá-lo, porque só exercita
  // o CAMINHO DE DECISÃO (tem chave? a métrica existe?). Se algum dia uma
  // chamada de rede vazar para cá, ela falha — que é o comportamento certo.
  ALSHAM_TEXT_API_KEY: 'nao-e-uma-chave',
  ALSHAM_IMAGE_API_KEY: 'nao-e-uma-chave',
};

let pool: Pool;

before(async () => {
  if (SEM_BANCO) return;
  pool = new Pool({ connectionString: URL_BANCO, max: 4 });

  await pool.query(
    `insert into core.tenants (id, slug, name, plan_code) values
       ($1, 'tenant-forja-pro', 'Tenant da forja', 'pro'),
       ($2, 'tenant-forja-sem', 'Tenant sem métrica', 'sem-metrica')
     on conflict (id) do nothing`,
    [TENANT_PRO, TENANT_SEM_METRICA],
  );
});

after(async () => {
  if (SEM_BANCO) return;
  await pool.end();
});

beforeEach(async () => {
  if (SEM_BANCO) return;
  await pool.query('delete from core.ai_generations where tenant_id = any($1)', [
    [TENANT_PRO, TENANT_SEM_METRICA],
  ]);
  await pool.query('delete from core.usage_ledger where tenant_id = any($1)', [
    [TENANT_PRO, TENANT_SEM_METRICA],
  ]);
  await pool.query('delete from core.event_outbox where tenant_id = any($1)', [
    [TENANT_PRO, TENANT_SEM_METRICA],
  ]);
  await pool.query('delete from core.ai_brand_context where tenant_id = any($1)', [
    [TENANT_PRO, TENANT_SEM_METRICA],
  ]);
});

describe('⭐ o estado honesto, contra o plano de verdade', { skip: SEM_BANCO }, () => {
  test('plano `pro` com a métrica no seed: pronto', async () => {
    const e = await readEngineState(
      { pool, env: ENV_COM_CHAVE_FALSA },
      TENANT_PRO,
      'text',
      new Date(),
    );
    assert.equal(e.status, 'ready');
  });

  test('⭐ sem chave neste ambiente: NÃO CONFIGURADO', async () => {
    const e = await readEngineState({ pool, env: ENV_SEM_CHAVE }, TENANT_PRO, 'text', new Date());
    assert.equal(e.status, 'unconfigured');
  });

  /**
   * ⭐⭐ **SEM MEDIÇÃO, SEM GERAÇÃO — contra o banco.**
   *
   * O tenant tem plano `sem-metrica`, que não existe em `core.plan_limits`. O
   * `SELECT` volta vazio, `checkLimit()` nega por omissão, e a forja desliga.
   */
  test('⭐⭐ plano sem teto declarado: geração DESLIGADA', async () => {
    const e = await readEngineState(
      { pool, env: ENV_COM_CHAVE_FALSA },
      TENANT_SEM_METRICA,
      'text',
      new Date(),
    );
    assert.equal(e.status, 'unmetered');
  });

  test('⛔ e a geração é RECUSADA, sem gravar nada', async () => {
    const r = await generate(
      { pool, env: ENV_COM_CHAVE_FALSA },
      {
        tenantId: TENANT_SEM_METRICA,
        userId: null,
        kind: 'text',
        instruction: 'qualquer coisa',
        workContext: '',
      },
    );
    assert.equal(r.ok, false);

    const { rows } = await pool.query('select count(*)::int as n from core.ai_generations where tenant_id = $1', [
      TENANT_SEM_METRICA,
    ]);
    assert.equal(rows[0].n, 0, 'uma recusa do produto não é um fato do tenant');
    const { rows: fatos } = await pool.query(
      "select count(*)::int as n from core.event_outbox where tenant_id = $1 and event_type like 'core.generation.%'",
      [TENANT_SEM_METRICA],
    );
    assert.equal(fatos[0].n, 0);
  });
});

describe('⭐ gerar mede, e o prompt não vaza', { skip: SEM_BANCO }, () => {
  test('a geração completa grava resultado e emite os dois fatos', async () => {
    const r = await generate(
      { pool, env: ENV_DEMO },
      {
        tenantId: TENANT_PRO,
        userId: null,
        kind: 'text',
        instruction: 'uma legenda curta',
        workContext: 'Campanha de setembro',
        sourceModule: 'ops',
      },
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;

    const { rows } = await pool.query(
      'select status, consumed, prompt, prompt_length, adapter_id from core.ai_generations where id = $1',
      [r.generationId],
    );
    assert.equal(rows[0].status, 'completed');
    assert.ok(rows[0].prompt_length > 0);
    assert.match(rows[0].prompt, /O que é preciso produzir: uma legenda curta/);

    const { rows: fatos } = await pool.query(
      "select event_type, payload from core.event_outbox where tenant_id = $1 and event_type like 'core.generation.%' order by occurred_at",
      [TENANT_PRO],
    );
    assert.equal(fatos.length, 2, 'requested e completed');
    assert.equal(fatos[0].event_type, 'core.generation.requested');
    assert.equal(fatos[1].event_type, 'core.generation.completed');
  });

  /**
   * ⛔ **O PROMPT NÃO VAI PARA A CAIXA DE SAÍDA.** CORE-SPEC §4: a trilha nunca
   * guarda segredo — e o prompt carrega o Cérebro da Marca do tenant.
   */
  test('⛔ nem o prompt, nem a marca, nem o adaptador entram no evento', async () => {
    await pool.query(
      `insert into core.ai_brand_context (tenant_id, identity, tone, forbidden)
       values ($1, 'Somos uma fabrica de esquadrias', 'seco', array['barato'])
       on conflict (tenant_id) do update set identity = excluded.identity`,
      [TENANT_PRO],
    );

    const r = await generate(
      { pool, env: ENV_DEMO },
      { tenantId: TENANT_PRO, userId: null, kind: 'text', instruction: 'x', workContext: '' },
    );
    assert.equal(r.ok, true);

    const { rows } = await pool.query(
      "select payload::text as p from core.event_outbox where tenant_id = $1 and event_type like 'core.generation.%'",
      [TENANT_PRO],
    );
    assert.ok(rows.length > 0);
    for (const linha of rows) {
      assert.doesNotMatch(linha.p, /esquadrias/, 'a identidade da marca vazou no evento');
      assert.doesNotMatch(linha.p, /demo-text/, 'o adaptador vazou no evento');
      assert.doesNotMatch(linha.p, /"prompt"/, 'o prompt vazou no evento');
      // E o que DEVE estar lá, está.
      assert.match(linha.p, /promptLength/);
      assert.match(linha.p, new RegExp(AI_METRIC));
    }
  });

  /**
   * ⭐ **A REDE DE SEGURANÇA no caminho completo:** o termo vetado pela marca é
   * acusado, não apagado — e a instrução do rascunho carrega o aviso.
   */
  test('⭐ termo vetado é acusado, e o rascunho sai marcado', async () => {
    await pool.query(
      `insert into core.ai_brand_context (tenant_id, identity, tone, forbidden)
       values ($1, '', '', array['DEMONSTRAÇÃO'])
       on conflict (tenant_id) do update set forbidden = excluded.forbidden`,
      [TENANT_PRO],
    );

    // O mock devolve um texto que começa com "[DEMONSTRAÇÃO …]" — então o veto
    // acima é acusado de verdade, sem precisar de motor nenhum.
    const r = await generate(
      { pool, env: ENV_DEMO },
      { tenantId: TENANT_PRO, userId: null, kind: 'text', instruction: 'x', workContext: '' },
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;

    assert.deepEqual(r.violations, ['DEMONSTRAÇÃO']);
    assert.match(r.draftInstruction, /Rascunho gerado pelo motor ALSHAM/);
    assert.match(r.draftInstruction, /a marca veta/);
  });

  /**
   * ⭐⭐ **LABORATÓRIO NÃO CONTAMINA O LIVRO-CAIXA.**
   *
   * Mesma decisão do `usage_ledger.is_mock` do kraken-v2, e a razão está
   * escrita lá: *"custo de laboratório contamina o relatório de margem, que é
   * a razão de existir do ledger"*.
   */
  test('⭐⭐ em modo demonstração NADA é lançado no usage_ledger', async () => {
    const r = await generate(
      { pool, env: ENV_DEMO },
      { tenantId: TENANT_PRO, userId: null, kind: 'text', instruction: 'x', workContext: '' },
    );
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.demo, true);

    const { rows } = await pool.query(
      'select count(*)::int as n from core.usage_ledger where tenant_id = $1 and metric = $2',
      [TENANT_PRO, AI_METRIC],
    );
    assert.equal(rows[0].n, 0, 'o mock lançou consumo — o relatório de margem mentiria');

    // ⭐ **Mas ELA EXISTE no registro, MARCADA.** É a diferença entre "fora da
    // conta" e "invisível": o operador precisa ver o que aconteceu, e o
    // livro-caixa precisa não ver. Minerado do `usage_ledger.is_mock` do
    // kraken-v2, com a marca virando COLUNA em vez de palpite sobre o nome do
    // adaptador.
    const { rows: reg } = await pool.query(
      'select is_mock from core.ai_generations where id = $1',
      [r.generationId],
    );
    assert.equal(reg[0].is_mock, true, 'a geração de laboratório não ficou marcada');
  });

  test('⛔ e a geração REAL nasce com is_mock falso', async () => {
    // Sem `ALSHAM_FORGE_DEMO`, o caminho é o do adaptador real — que sem chave
    // nem chega a ser chamado. O que importa aqui é a MARCA no registro.
    const e = await readEngineState(
      { pool, env: ENV_COM_CHAVE_FALSA },
      TENANT_PRO,
      'text',
      new Date(),
    );
    assert.equal(e.status, 'ready');
    assert.equal(isDemoMode(ENV_COM_CHAVE_FALSA), false);
  });
});

describe('⛔ o endpoint da forja', { skip: SEM_BANCO }, () => {
  const deps = () => ({
    pool,
    secret: 'segredo-do-correio',
    forgeSecret: 'segredo-da-forja',
    env: ENV_DEMO,
  });

  /**
   * ⭐ **Dois segredos, dois chamadores.** Quem tem o do correio não gera — e
   * gerar queima cota de plano a cada chamada.
   */
  test('⭐ o segredo do CORREIO não abre a forja', async () => {
    const r = await handleRequest(
      { method: 'POST', path: '/forja/gerar', secret: 'segredo-do-correio', body: {} },
      deps(),
    );
    assert.equal(r.status, 401);
  });

  test('⭐ e o segredo da FORJA não dispara o correio', async () => {
    const r = await handleRequest(
      { method: 'POST', path: '/correio/entregar', secret: 'segredo-da-forja' },
      deps(),
    );
    assert.equal(r.status, 401);
  });

  /**
   * ⛔ **Forja sem segredo configurado é forja DESLIGADA, não forja aberta.**
   *
   * É a lição do `?? ''` que o kraken registrou: string vazia nunca é
   * fallback. Um ambiente que só esqueceu de configurar não pode virar um
   * ambiente que aceita qualquer chamada.
   */
  test('⛔ sem forgeSecret, a rota devolve 503 — nunca 200', async () => {
    const r = await handleRequest(
      { method: 'POST', path: '/forja/gerar', secret: '', body: {} },
      { pool, secret: 'segredo-do-correio', env: ENV_DEMO },
    );
    assert.equal(r.status, 503);
  });

  test('gera pelo endpoint, e a resposta traz o rótulo da casa', async () => {
    const r = await handleRequest(
      {
        method: 'POST',
        path: '/forja/gerar',
        secret: 'segredo-da-forja',
        body: { tenantId: TENANT_PRO, kind: 'text', instruction: 'uma legenda' },
      },
      deps(),
    );
    assert.equal(r.status, 200);
    const corpo = r.body as { rotulo: { step: string; engine: string }; output: string };
    assert.equal(corpo.rotulo.engine, 'motor ALSHAM');
    assert.equal(corpo.rotulo.step, 'Texto');
  });

  /**
   * ⚖️ **A LEI DO MOTOR na fronteira HTTP.** O que sai desta rota é o que o
   * portal renderiza — e nada nele pode citar fornecedor.
   */
  test('⚖️ a resposta HTTP não cita fornecedor nenhum', async () => {
    const r = await handleRequest(
      {
        method: 'POST',
        path: '/forja/gerar',
        secret: 'segredo-da-forja',
        body: { tenantId: TENANT_PRO, kind: 'image', instruction: 'uma arte' },
      },
      deps(),
    );
    const texto = JSON.stringify(r.body).toLowerCase();
    for (const nome of ['anthropic', 'openai', 'gemini', 'ideogram', 'flux', 'fal.ai']) {
      assert.equal(texto.includes(nome), false, `"${nome}" saiu na resposta HTTP`);
    }
    assert.match(texto, /motor alsham/);
  });

  test('o estado é consultável, e diz que é demonstração', async () => {
    const r = await handleRequest(
      {
        method: 'GET',
        path: '/forja/estado',
        secret: 'segredo-da-forja',
        body: { tenantId: TENANT_PRO, kind: 'text' },
      },
      deps(),
    );
    assert.equal(r.status, 200);
    const corpo = r.body as { estado: { status: string }; demo: boolean };
    assert.equal(corpo.estado.status, 'demo');
    assert.equal(corpo.demo, true);
  });

  test('modalidade desconhecida é 400, não 500', async () => {
    const r = await handleRequest(
      {
        method: 'POST',
        path: '/forja/gerar',
        secret: 'segredo-da-forja',
        body: { tenantId: TENANT_PRO, kind: 'video' },
      },
      deps(),
    );
    assert.equal(r.status, 400);
  });
});

describe('⚖️ a normalização da mensagem de erro', () => {
  /**
   * ⛔ O erro cru do fornecedor cita o nome dele. O kraken registrou o caso
   * real em produção: *"Ideogram 402: You do not have sufficient balance"*.
   * Essa string subiria pela pilha até a tela.
   */
  test('⛔ o nome do fornecedor NUNCA sobrevive à normalização', async () => {
    const crus = [
      new Error('Ideogram 402: You do not have sufficient balance'),
      new Error('anthropic api error 401: invalid x-api-key'),
      new Error('fal flux/dev 429 rate limited'),
      new Error('OpenAI 500 internal'),
    ];
    for (const cru of crus) {
      const seguro = safeFailureReason(cru).toLowerCase();
      // ⚠️ **Fronteira de palavra, e a diferença foi uma reprovação real:**
      // `includes('fal')` casa dentro de "fale com quem administra". Um
      // detector que acusa a própria mensagem de ajuda é um detector que
      // alguém desliga — e aí ele para de proteger o que importa.
      for (const nome of ['ideogram', 'anthropic', 'fal', 'flux', 'openai', 'gpt']) {
        assert.doesNotMatch(
          seguro,
          new RegExp(`\\b${nome}\\b`),
          `"${nome}" sobreviveu: ${seguro}`,
        );
      }
    }
  });

  test('e a frase diz o que resolver', () => {
    assert.match(safeFailureReason(new Error('402 balance')), /sem saldo/);
    assert.match(safeFailureReason(new Error('401 unauthorized')), /credencial/);
    assert.match(safeFailureReason(new Error('429 rate')), /pedidos demais/);
    assert.match(safeFailureReason(new Error('coisa estranha')), /Nada foi cobrado/);
  });
});

describe('o mock só existe no modo demonstração', () => {
  test('⛔ sem ALSHAM_FORGE_DEMO=true, o adaptador é o real', () => {
    assert.equal(isDemoMode({}), false);
    assert.equal(isDemoMode({ ALSHAM_FORGE_DEMO: 'false' }), false);
    // ⛔ E nem "quase": só o literal `true` liga o mock.
    assert.equal(isDemoMode({ ALSHAM_FORGE_DEMO: '1' }), false);
    assert.equal(isDemoMode({ ALSHAM_FORGE_DEMO: 'TRUE' }), false);
    assert.equal(isDemoMode({ ALSHAM_FORGE_DEMO: 'true' }), true);

    assert.notEqual(adapterFor('text', false).id, adapterFor('text', true).id);
  });

  /**
   * ⛔ **Falta de chave NÃO cai para o mock.** É a regra mais importante desta
   * etapa: mock que se passa por IA em produção é a mentira mais cara que este
   * produto poderia contar.
   */
  test('⛔ sem chave, o adaptador real continua sendo o real — e diz que não tem chave', () => {
    assert.equal(hasKeyFor('text', {}, false), false);
    assert.equal(adapterFor('text', false).id, 'text-primary');
  });

  test('⚠️ chave em branco NÃO conta como configurada', () => {
    // Lição do `?? ''` do kraken: string vazia num painel de deploy é o modo
    // mais comum de um ambiente parecer configurado e não estar.
    assert.equal(hasKeyFor('text', { ALSHAM_TEXT_API_KEY: '   ' }, false), false);
    assert.equal(hasKeyFor('text', { ALSHAM_TEXT_API_KEY: 'x' }, false), true);
  });
});
