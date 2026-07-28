import { createServer } from 'node:http';
import { Pool } from 'pg';

import { handleRequest } from './handler.ts';

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
  const port = Number(process.env.PORT ?? 8080);

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const cabecalho = req.headers[CABECALHO_SEGREDO];

    void handleRequest(
      {
        method: req.method ?? 'GET',
        path: url.pathname,
        ...(typeof cabecalho === 'string' ? { secret: cabecalho } : {}),
      },
      { pool, secret },
    )
      .then((r) => {
        res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(r.body));
      })
      .catch((err: unknown) => {
        // O detalhe vai para o log do servidor, nunca para o corpo da
        // resposta: mensagem de erro de banco na resposta é vazamento, não
        // diagnóstico.
        console.error('[correio] falha na rodada:', err);
        res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'falha interna' }));
      });
  });

  server.listen(port, () => {
    console.log(`[correio] ouvindo na porta ${port}`);
  });
}

// Só roda quando este arquivo É o processo — importar não sobe servidor.
if (process.argv[1] && process.argv[1].endsWith('server.ts')) main();
