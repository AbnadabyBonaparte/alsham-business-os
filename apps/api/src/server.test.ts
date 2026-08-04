import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createRequestListener } from './server.ts';
import { handleRequest, type HandlerDeps, type HandlerResult } from './handler.ts';

/**
 * ⭐ **O TESTE DA COSTURA HTTP — o que faltava.**
 *
 * O bug de produção (todo `/engenheiro/conversar` e `/forja/*` devolvendo 400 em
 * microssegundos) vivia EXATAMENTE aqui: o `server.ts` não lia o corpo do pedido,
 * e o `handler.test.ts` nunca percebeu porque injeta o `body` já parseado. Este
 * arquivo exercita o servidor HTTP DE VERDADE — sobe um `node:http`, manda bytes
 * pela rede e confere que o corpo chega parseado ao handler.
 */

/** Sobe um servidor com o listener e um handler dado; devolve base URL + fechar. */
async function subir(
  handle: (
    req: { method: string; path: string; secret?: string; body?: unknown },
    deps: HandlerDeps,
  ) => Promise<HandlerResult>,
  deps: HandlerDeps,
): Promise<{ base: string; server: Server }> {
  const server = createServer(createRequestListener(handle, deps));
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as AddressInfo;
  return { base: `http://127.0.0.1:${port}`, server };
}

const DEPS_FALSO = { pool: {} as never, secret: 'correio', forgeSecret: 'forja' } as HandlerDeps;

// ---------------------------------------------------------------------------
// A COSTURA — o corpo chega parseado (a prova direta do conserto).
// ---------------------------------------------------------------------------

test('o corpo JSON do POST chega PARSEADO ao handler (o bug consertado)', async () => {
  let visto: unknown;
  const { base, server } = await subir(async (req) => {
    visto = req.body;
    return { status: 200, body: { ok: true } };
  }, DEPS_FALSO);
  try {
    const corpo = { system: 'um prompt', messages: [{ role: 'user', content: 'oi' }] };
    const r = await fetch(`${base}/engenheiro/conversar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forge-secret': 'forja' },
      body: JSON.stringify(corpo),
    });
    assert.equal(r.status, 200);
    // ⭐ ANTES do conserto isto era `undefined` — a causa raiz do 400.
    assert.deepEqual(visto, corpo, 'o corpo precisa chegar como objeto parseado');
  } finally {
    server.close();
  }
});

test('cada família de rota lê o SEU cabeçalho de segredo', async () => {
  const capturado: Record<string, string | undefined> = {};
  const { base, server } = await subir(async (req) => {
    capturado[req.path] = req.secret;
    return { status: 200, body: {} };
  }, DEPS_FALSO);
  try {
    await fetch(`${base}/engenheiro/conversar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forge-secret': 'DA_FORJA' },
      body: '{}',
    });
    await fetch(`${base}/correio/entregar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-correio-secret': 'DO_CORREIO' },
      body: '{}',
    });
    assert.equal(capturado['/engenheiro/conversar'], 'DA_FORJA', 'engenheiro usa x-forge-secret');
    assert.equal(capturado['/correio/entregar'], 'DO_CORREIO', 'correio usa x-correio-secret');
  } finally {
    server.close();
  }
});

test('corpo vazio vira undefined — o /correio/entregar (sem corpo) segue vivo', async () => {
  let visto: unknown = 'nunca-tocado';
  const { base, server } = await subir(async (req) => {
    visto = req.body;
    return { status: 200, body: {} };
  }, DEPS_FALSO);
  try {
    await fetch(`${base}/correio/entregar`, {
      method: 'POST',
      headers: { 'x-correio-secret': 'correio' },
    });
    assert.equal(visto, undefined, 'sem corpo, body é undefined (não quebra)');
  } finally {
    server.close();
  }
});

test('JSON malformado é 400 do CHAMADOR e o handler nem é chamado', async () => {
  let chamou = false;
  const { base, server } = await subir(async () => {
    chamou = true;
    return { status: 200, body: {} };
  }, DEPS_FALSO);
  try {
    const r = await fetch(`${base}/engenheiro/conversar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forge-secret': 'forja' },
      body: '{ isto não é json',
    });
    assert.equal(r.status, 400);
    assert.equal(chamou, false, 'corpo inválido não deve chegar ao handler');
  } finally {
    server.close();
  }
});

// ---------------------------------------------------------------------------
// FIM A FIM com o handleRequest REAL — sem banco, sem motor: a prova do 400→502.
// ---------------------------------------------------------------------------

test('⭐ /engenheiro/conversar com corpo válido PASSA da validação e chega ao motor (502 sem chave, não 400)', async () => {
  // env sem ALSHAM_TEXT_API_KEY → converseText lança → 502. O pool nunca é tocado
  // pela rota do Engenheiro, então um pool falso basta.
  const deps = { pool: {} as never, secret: 'correio', forgeSecret: 'forja', env: {} } as HandlerDeps;
  const { base, server } = await subir(handleRequest, deps);
  try {
    const bom = await fetch(`${base}/engenheiro/conversar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forge-secret': 'forja' },
      body: JSON.stringify({ system: 'sou o Engenheiro', messages: [{ role: 'user', content: 'oi' }] }),
    });
    // ⭐ A PROVA: com o corpo chegando, a validação passa e a rota vai ao motor.
    // Sem chave de motor, o relay responde 502 — NÃO mais o 400 de payload vazio.
    assert.equal(bom.status, 502, 'corpo válido → chegou ao motor (502 sem chave), não 400');

    // Contraste: corpo VAZIO ainda é o 400 honesto de "system e messages".
    const vazio = await fetch(`${base}/engenheiro/conversar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forge-secret': 'forja' },
    });
    assert.equal(vazio.status, 400, 'sem corpo, o 400 de payload continua correto');
  } finally {
    server.close();
  }
});

test('segredo errado ainda é 401 (a auth continua antes do payload)', async () => {
  const deps = { pool: {} as never, secret: 'correio', forgeSecret: 'forja', env: {} } as HandlerDeps;
  const { base, server } = await subir(handleRequest, deps);
  try {
    const r = await fetch(`${base}/engenheiro/conversar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forge-secret': 'ERRADO' },
      body: JSON.stringify({ system: 's', messages: [] }),
    });
    assert.equal(r.status, 401);
  } finally {
    server.close();
  }
});
