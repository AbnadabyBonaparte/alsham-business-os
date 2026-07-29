import { timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';

import { engineLabel } from '@alsham/ai';
import type { GenerationKind } from '@alsham/ai';

import { runCourierOnce } from './composition.ts';
import { judgeHealth, readQueueHealth } from './health.ts';
import { generate, isDemoMode, readEngineState } from './forge-service.ts';

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
  /**
   * ⭐ **O segredo da FORJA — separado do segredo do correio, de propósito.**
   *
   * São dois chamadores diferentes com dois riscos diferentes: o correio é
   * acionado por um `cron` do banco e não custa dinheiro por chamada; a forja é
   * acionada pelo portal e **queima cota de plano a cada pedido**. Um segredo
   * só faria rotacionar o da forja derrubar a entrega de eventos, e vice-versa.
   *
   * ⛔ Sem prefixo `NEXT_PUBLIC_`, nunca. E nenhum dos dois é a `service_role`:
   * se um vazar, rotaciona-se um segredo; se a chave-mãe vazar, rotaciona-se o
   * banco inteiro.
   */
  readonly forgeSecret?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/** As rotas que este handler conhece. Lista fechada. */
const ROTAS = [
  '/correio/entregar',
  '/correio/saude',
  '/forja/gerar',
  '/forja/estado',
] as const;

interface ForgeBody {
  tenantId?: unknown;
  userId?: unknown;
  kind?: unknown;
  instruction?: unknown;
  workContext?: unknown;
  sourceModule?: unknown;
  sourceRef?: unknown;
}

function lerModalidade(v: unknown): GenerationKind | null {
  return v === 'text' || v === 'image' ? v : null;
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
  req: { method: string; path: string; secret?: string; body?: unknown },
  deps: HandlerDeps,
): Promise<HandlerResult> {
  const rota = req.path.replace(/\/+$/, '');

  if (!(ROTAS as readonly string[]).includes(rota)) {
    return { status: 404, body: { error: 'rota desconhecida' } };
  }

  const daForja = rota.startsWith('/forja/');

  // ⭐ Cada família de rota confere o SEU segredo. Quem tem o do correio não
  // gera, e quem tem o da forja não dispara entrega.
  //
  // ⚠️ `forgeSecret` ausente = forja DESLIGADA, não forja aberta. Um `?? ''`
  // aqui faria a rota aceitar qualquer coisa num ambiente que só esqueceu de
  // configurar — e é exatamente a lição do `?? ''` que o kraken registrou.
  const esperado = daForja ? deps.forgeSecret : deps.secret;
  if (typeof esperado !== 'string' || esperado.length === 0) {
    return { status: 503, body: { error: 'rota não configurada neste ambiente' } };
  }

  if (!segredoConfere(req.secret, esperado)) {
    // Mensagem curta e igual para segredo ausente e segredo errado: dizer
    // "faltou o cabeçalho" ensina quem está tentando.
    return { status: 401, body: { error: 'não autorizado' } };
  }

  if (daForja) return atenderForja(rota, req, deps);

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

/**
 * ⭐ **AS DUAS ROTAS DA FORJA.**
 *
 * - `GET  /forja/estado` — o estado honesto da modalidade neste ambiente
 * - `POST /forja/gerar`  — gera, mede e devolve
 *
 * ⚖️ **O que sai daqui NUNCA cita fornecedor.** O rótulo vem de
 * `engineLabel()`, que só sabe dizer a ETAPA e "motor ALSHAM"; a razão de
 * falha vem de `safeFailureReason()`, que normaliza o erro cru. Os dois são a
 * Lei do Motor virando código, nas duas pontas.
 *
 * ⚠️ **O `tenantId` vem no corpo, e isso é seguro AQUI e só aqui.** Quem chama
 * esta rota é o portal, do servidor, com o tenant já resolvido da sessão
 * cruzada com `core.memberships` — nunca o navegador. O segredo é o que
 * garante que só o portal chama; se ele vazar, o problema é o segredo, não o
 * parâmetro. A alternativa (esta rota resolver a sessão sozinha) duplicaria a
 * resolução de tenant em dois lugares, que é pior.
 */
async function atenderForja(
  rota: string,
  req: { method: string; path: string; secret?: string; body?: unknown },
  deps: HandlerDeps,
): Promise<HandlerResult> {
  const env = deps.env ?? process.env;
  const corpo = (req.body ?? {}) as ForgeBody;

  const tenantId = typeof corpo.tenantId === 'string' ? corpo.tenantId : null;
  const kind = lerModalidade(corpo.kind);

  if (tenantId === null) return { status: 400, body: { error: 'tenantId ausente' } };
  if (kind === null) return { status: 400, body: { error: 'modalidade desconhecida' } };

  if (rota === '/forja/estado') {
    if (req.method !== 'GET' && req.method !== 'POST') {
      return { status: 405, body: { error: 'use GET' } };
    }
    const estado = await readEngineState({ pool: deps.pool, env }, tenantId, kind, new Date());
    return { status: 200, body: { estado, rotulo: engineLabel(kind), demo: isDemoMode(env) } };
  }

  // Gerar MUDA o estado e QUEIMA COTA — então é POST, sempre.
  if (req.method !== 'POST') return { status: 405, body: { error: 'use POST' } };

  const resultado = await generate(
    { pool: deps.pool, env },
    {
      tenantId,
      userId: typeof corpo.userId === 'string' ? corpo.userId : null,
      kind,
      instruction: typeof corpo.instruction === 'string' ? corpo.instruction : '',
      workContext: typeof corpo.workContext === 'string' ? corpo.workContext : '',
      ...(typeof corpo.sourceModule === 'string' ? { sourceModule: corpo.sourceModule } : {}),
      ...(typeof corpo.sourceRef === 'string' ? { sourceRef: corpo.sourceRef } : {}),
    },
  );

  if (!resultado.ok) {
    // 422 e não 500: o pedido chegou inteiro e o produto o recusou por uma
    // razão que o operador entende. 500 mandaria o portal tentar de novo.
    return { status: 422, body: { error: resultado.reason } };
  }

  return {
    status: 200,
    body: {
      generationId: resultado.generationId,
      output: resultado.output,
      draftInstruction: resultado.draftInstruction,
      violations: resultado.violations,
      demo: resultado.demo,
      rotulo: engineLabel(kind),
    },
  };
}
