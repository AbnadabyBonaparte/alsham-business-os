import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { Pool } from 'pg';

import { handleRequest, type HandlerDeps, type HandlerResult } from './handler.ts';

/**
 * O processo. Um `node:http` e nada mais.
 *
 * ⚠️ **Este arquivo é o único que lê variável de ambiente.** Todo o resto
 * recebe o que precisa por parâmetro — é o que torna a composição testável
 * contra um Postgres de teste sem nenhum truque.
 *
 * ⛔ Roda com `service_role`. Nunca junto do app do cliente.
 *
 * Nada aqui está no ar: subir isto é ato do dono (runbook §6).
 */

const CABECALHO_SEGREDO = 'x-correio-secret';
const CABECALHO_FORJA = 'x-forge-secret';

/**
 * ⛔ **O teto do corpo — 1 MB.** Uma rodada de conversa do Engenheiro (system +
 * histórico + ferramentas) não passa disso; um corpo maior é engano ou abuso, e
 * ler stream sem teto é como um cliente derruba o processo por memória.
 */
const LIMITE_CORPO = 1_000_000;

/** O corpo chegou, mas não é JSON válido (ou passou do teto). Vira 400, não 500. */
export class CorpoInvalido extends Error {}

/**
 * ⭐ **A COSTURA QUE FALTAVA — ler e parsear o corpo do pedido.**
 *
 * O `node:http` entrega o corpo como STREAM, não como objeto: sem acumular os
 * chunks e fazer `JSON.parse`, `handleRequest` recebia `body: undefined` e toda
 * rota que depende do corpo (`/forja/*`, `/engenheiro/conversar`) morria com 400
 * "campo obrigatório ausente" — em microssegundos, antes de tocar o motor. Era o
 * bug: o servidor montava o pedido só com método, caminho e segredo.
 *
 * - Corpo vazio → `undefined` (o `/correio/entregar` não manda corpo, e deve
 *   seguir funcionando).
 * - JSON malformado ou acima do teto → `CorpoInvalido` (o chamador responde 400).
 */
export function lerCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (c: Buffer) => {
      total += c.length;
      if (total > LIMITE_CORPO) {
        reject(new CorpoInvalido('corpo grande demais'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const cru = Buffer.concat(chunks).toString('utf8').trim();
      if (cru.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(cru));
      } catch {
        reject(new CorpoInvalido('json inválido'));
      }
    });
    req.on('error', (e) => reject(e));
  });
}

/**
 * A costura HTTP → `handleRequest`, isolada e TESTÁVEL.
 *
 * ⭐ Recebe `handle` por parâmetro (injeção): o teste passa um handler falso e
 * exercita o parsing do corpo e o mapeamento de cabeçalho SEM banco nem motor —
 * o trecho que antes não tinha teste e por isso quebrou em produção com o CI
 * verde. `main()` passa o `handleRequest` de verdade.
 */
export function createRequestListener(
  handle: (
    req: { method: string; path: string; secret?: string; body?: unknown },
    deps: HandlerDeps,
  ) => Promise<HandlerResult>,
  deps: HandlerDeps,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // ⭐ Cada família de rota lê o SEU cabeçalho. A forja e o Engenheiro são o
    // mesmo chamador (o portal, com FORGE_SECRET); o correio é o cron do banco.
    const daForja =
      url.pathname.startsWith('/forja/') || url.pathname.startsWith('/engenheiro/');
    const cabecalho = daForja
      ? req.headers[CABECALHO_FORJA]
      : req.headers[CABECALHO_SEGREDO];

    lerCorpo(req)
      .then((body) =>
        handle(
          {
            method: req.method ?? 'GET',
            path: url.pathname,
            ...(typeof cabecalho === 'string' ? { secret: cabecalho } : {}),
            ...(body !== undefined ? { body } : {}),
          },
          deps,
        ),
      )
      .then((r) => {
        res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(r.body));
      })
      .catch((err: unknown) => {
        // Corpo malformado é erro do CHAMADOR (400), não falha interna (500):
        // dizer 500 mandaria o portal tentar de novo o que nunca vai passar.
        if (err instanceof CorpoInvalido) {
          res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'corpo inválido' }));
          return;
        }
        // O detalhe vai para o log do servidor, nunca para o corpo da resposta:
        // mensagem de erro de banco na resposta é vazamento, não diagnóstico.
        console.error('[correio] falha na rodada:', err);
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'falha interna' }));
      });
  };
}

function exigir(nome: string): string {
  const v = process.env[nome];
  if (!v) {
    // Falha no arranque, alto e claro. Um correio que sobe sem segredo é um
    // endpoint aberto; um que sobe sem banco entrega nada em silêncio. Os dois
    // são piores do que não subir.
    throw new Error(`Variável de ambiente obrigatória ausente: ${nome}`);
  }
  return v;
}

export function main(): void {
  const pool = new Pool({ connectionString: exigir('DATABASE_URL'), max: 4 });
  const secret = exigir('COURIER_SECRET');
  // ⚠️ Opcional de propósito: sem FORGE_SECRET as rotas da forja e do Engenheiro
  // ficam DESLIGADAS (503), não abertas. Só o correio exige segredo no arranque.
  const forgeSecret = process.env.FORGE_SECRET;
  const port = Number(process.env.PORT ?? 8080);

  const deps: HandlerDeps = {
    pool,
    secret,
    env: process.env,
    ...(typeof forgeSecret === 'string' ? { forgeSecret } : {}),
  };

  const server = createServer(createRequestListener(handleRequest, deps));

  server.listen(port, () => {
    console.log(`[correio] ouvindo na porta ${port}`);
  });
}

// Só roda quando este arquivo É o processo — importar não sobe servidor.
if (process.argv[1] && process.argv[1].endsWith('server.ts')) main();
