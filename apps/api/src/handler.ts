import { timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';

import { runCourierOnce } from './composition.ts';
import { judgeHealth, readQueueHealth } from './health.ts';

/**
 * O endpoint protegido que aciona uma rodada do correio.
 *
 * Framework-free de propósito: recebe método, caminho e cabeçalho, devolve
 * status e corpo. Serve num `node:http`, num route handler da Next, numa
 * função da Vercel ou num container — sem reescrever nada. Framework é
 * aluguel (CLAUDE.md §5.3); este arquivo não assina contrato com nenhum.
 */

export interface HandlerResult {
  readonly status: number;
  readonly body: unknown;
}

/**
 * Compara o segredo em **tempo constante**.
 *
 * `a === b` sai no primeiro caractere diferente, e a diferença de tempo entre
 * uma comparação que falha no caractere 1 e outra que falha no 30 é medível
 * pela rede. Com um endpoint que qualquer um pode chamar em laço, isso é
 * suficiente para descobrir o segredo caractere a caractere.
 *
 * O `length` é comparado antes porque `timingSafeEqual` **lança** com buffers
 * de tamanhos diferentes — e esse vazamento (o tamanho) é aceitável; o
 * conteúdo não.
 */
function segredoConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export interface HandlerDeps {
  readonly pool: Pool;
  /**
   * O segredo do endpoint. Vem do ambiente do SERVIDOR.
   *
   * ⛔ Sem prefixo `NEXT_PUBLIC_`, nunca. E é um segredo **próprio**, não a
   * `service_role`: quem chama o correio não precisa poder fazer tudo o que a
   * chave-mãe faz. Se este vazar, rotaciona-se um segredo; se a `service_role`
   * vazar, rotaciona-se o banco inteiro.
   */
  readonly secret: string;
  readonly batchSize?: number;
}

/**
 * Duas rotas, e só duas:
 *
 * - `POST /correio/entregar` — roda uma rodada e devolve o relatório
 * - `GET  /correio/saude`    — devolve a saúde da fila
 *
 * As duas exigem o segredo. A de saúde também: a contagem de eventos por
 * tenant é informação de operação, e informação de operação não é pública.
 */
export async function handleRequest(
  req: { method: string; path: string; secret?: string },
  deps: HandlerDeps,
): Promise<HandlerResult> {
  const rota = req.path.replace(/\/+$/, '');

  if (rota !== '/correio/entregar' && rota !== '/correio/saude') {
    return { status: 404, body: { error: 'rota desconhecida' } };
  }

  if (!segredoConfere(req.secret, deps.secret)) {
    // Mensagem curta e igual para segredo ausente e segredo errado: dizer
    // "faltou o cabeçalho" ensina quem está tentando.
    return { status: 401, body: { error: 'não autorizado' } };
  }

  if (rota === '/correio/saude') {
    if (req.method !== 'GET') return { status: 405, body: { error: 'use GET' } };
    const saude = await readQueueHealth(deps.pool);
    return { status: 200, body: { ...saude, veredito: judgeHealth(saude) } };
  }

  // Entregar MUDA o estado — então é POST. Um GET que entrega seria reexecutado
  // por qualquer prefetch, crawler ou retry de proxy.
  if (req.method !== 'POST') return { status: 405, body: { error: 'use POST' } };

  const relatorio = await runCourierOnce(deps.pool, {
    ...(deps.batchSize !== undefined ? { batchSize: deps.batchSize } : {}),
  });

  // 200 mesmo com evento morto: a rodada FUNCIONOU. Devolver erro faria o
  // agendador reagendar uma rodada que já fez o que devia — e o `dead`
  // aparece no relatório e na saúde, que é onde ele deve ser visto.
  return { status: 200, body: relatorio };
}
