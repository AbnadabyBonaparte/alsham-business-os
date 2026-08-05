import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import type { Pool } from 'pg';

import { handleRequest } from './handler.ts';

/**
 * O endpoint — a porta pela qual o correio é acionado.
 *
 * ⚠️ Estes testes **não tocam banco de propósito**: todos param antes disso,
 * na autorização ou no método. É exatamente o que se quer provar — que nenhuma
 * requisição sem segredo chega perto do `Pool`.
 *
 * O `pool` abaixo é uma armadilha: qualquer consulta explode o teste. Se algum
 * caminho não autorizado passasse a consultar o banco, a falha seria alta e
 * imediata, em vez de silenciosa.
 */
const POOL_PROIBIDO = {
  query: () => {
    throw new Error('o banco foi tocado numa requisição que não devia chegar até ele');
  },
  connect: () => {
    throw new Error('o banco foi tocado numa requisição que não devia chegar até ele');
  },
} as unknown as Pool;

const SEGREDO = 'segredo-de-teste-com-tamanho-razoavel';
const deps = { pool: POOL_PROIBIDO, secret: SEGREDO };

describe('autorização', () => {
  test('sem o cabeçalho, 401 — e o banco nem é tocado', async () => {
    const r = await handleRequest({ method: 'POST', path: '/correio/entregar' }, deps);
    assert.equal(r.status, 401);
  });

  test('com o segredo errado, 401', async () => {
    const r = await handleRequest(
      { method: 'POST', path: '/correio/entregar', secret: 'errado' },
      deps,
    );
    assert.equal(r.status, 401);
  });

  test('segredo do tamanho certo mas conteúdo errado também é 401', async () => {
    // O caso que uma comparação de comprimento sozinha deixaria passar.
    const mesmoTamanho = 'x'.repeat(SEGREDO.length);
    const r = await handleRequest(
      { method: 'POST', path: '/correio/entregar', secret: mesmoTamanho },
      deps,
    );
    assert.equal(r.status, 401);
  });

  test('a mensagem de 401 é a mesma para ausente e errado', async () => {
    // Dizer "faltou o cabeçalho" ensina quem está tentando.
    const sem = await handleRequest({ method: 'POST', path: '/correio/entregar' }, deps);
    const errado = await handleRequest(
      { method: 'POST', path: '/correio/entregar', secret: 'nao' },
      deps,
    );
    assert.deepEqual(sem.body, errado.body);
  });

  test('a rota de saúde TAMBÉM exige segredo', async () => {
    // Contagem de evento por tenant é informação de operação, e informação de
    // operação não é pública.
    const r = await handleRequest({ method: 'GET', path: '/correio/saude' }, deps);
    assert.equal(r.status, 401);
  });

  test('⭐ o observador proativo exige o segredo — sem ele, 401, e o banco nem é tocado', async () => {
    const r = await handleRequest({ method: 'POST', path: '/insight/computar' }, deps);
    assert.equal(r.status, 401);
  });
});

describe('roteamento', () => {
  test('rota desconhecida é 404, mesmo com o segredo certo', async () => {
    const r = await handleRequest(
      { method: 'POST', path: '/qualquer/coisa', secret: SEGREDO },
      deps,
    );
    assert.equal(r.status, 404);
  });

  test('404 vem ANTES da checagem de segredo — rota inexistente não é oráculo', async () => {
    const r = await handleRequest({ method: 'POST', path: '/nao/existe' }, deps);
    assert.equal(r.status, 404);
  });

  test('entregar por GET é 405 — o que muda estado não pode ser reexecutado por prefetch', async () => {
    const r = await handleRequest(
      { method: 'GET', path: '/correio/entregar', secret: SEGREDO },
      deps,
    );
    assert.equal(r.status, 405);
  });

  test('saúde por POST é 405', async () => {
    const r = await handleRequest(
      { method: 'POST', path: '/correio/saude', secret: SEGREDO },
      deps,
    );
    assert.equal(r.status, 405);
  });

  test('barra no fim não muda a rota', async () => {
    const r = await handleRequest({ method: 'POST', path: '/correio/entregar/' }, deps);
    assert.equal(r.status, 401, 'a rota foi reconhecida — parou na autorização, não em 404');
  });

  test('⭐ observar por GET é 405 — gravar aviso muda estado, não pode ser reexecutado por prefetch', async () => {
    // Com o segredo certo, chega ao método e para nele — antes de tocar o banco.
    const r = await handleRequest(
      { method: 'GET', path: '/insight/computar', secret: SEGREDO },
      deps,
    );
    assert.equal(r.status, 405);
  });
});

// ---------------------------------------------------------------------------
// O PORTÃO VERIFICADOR — /engenheiro/verificar (guardas; o banco não é tocado).
// A lógica de publish/fail-closed é provada em verify-service.test.ts (contra
// Postgres). Aqui provamos só que nenhuma requisição sem segredo, com método
// errado ou sem tenantId chega perto do Pool.
// ---------------------------------------------------------------------------
const SEGREDO_FORJA = 'segredo-forja-de-teste-tamanho-ok';
const depsForja = { pool: POOL_PROIBIDO, secret: SEGREDO, forgeSecret: SEGREDO_FORJA };

describe('portão verificador — guardas', () => {
  test('sem forgeSecret configurado, a rota é 503 (desligada, não aberta)', async () => {
    const r = await handleRequest(
      { method: 'POST', path: '/engenheiro/verificar', secret: SEGREDO },
      deps, // sem forgeSecret
    );
    assert.equal(r.status, 503);
  });

  test('exige o segredo da FORJA — não o do correio', async () => {
    // O segredo do correio não abre a rota do Engenheiro.
    const r = await handleRequest(
      { method: 'POST', path: '/engenheiro/verificar', secret: SEGREDO },
      depsForja,
    );
    assert.equal(r.status, 401);
  });

  test('GET é 405 — verificar QUEIMA COTA, não pode ser reexecutado por prefetch', async () => {
    const r = await handleRequest(
      { method: 'GET', path: '/engenheiro/verificar', secret: SEGREDO_FORJA },
      depsForja,
    );
    assert.equal(r.status, 405);
  });

  test('POST sem tenantId é 400 — e o banco NÃO é tocado', async () => {
    // Chega ao handler com o segredo certo, para na validação do tenant, antes
    // de qualquer consulta. Se tocasse o Pool, o POOL_PROIBIDO explodiria.
    const r = await handleRequest(
      { method: 'POST', path: '/engenheiro/verificar', secret: SEGREDO_FORJA, body: {} },
      depsForja,
    );
    assert.equal(r.status, 400);
  });
});
