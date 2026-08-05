import { timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';

import { engineLabel } from '@alsham/ai';
import type { GenerationKind } from '@alsham/ai';

import { runCourierOnce } from './composition.ts';
import { runInsightOnce } from './insight-service.ts';
import { judgeHealth, readQueueHealth } from './health.ts';
import { generate, isDemoMode, readEngineState } from './forge-service.ts';
import { converseText } from './forge-adapters.ts';
import { verifyAnswer } from './verify-service.ts';

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
  // ⭐ O observador proativo: uma rodada que lê os recebíveis vencidos e grava
  // os avisos em core.tenant_insights. Chamador é o CRON do banco (como o
  // correio), então usa o segredo do CORREIO — não custa dinheiro por chamada,
  // ao contrário da forja.
  '/insight/computar',
  '/forja/gerar',
  '/forja/estado',
  // ⭐ O relay do Engenheiro: uma rodada de conversa com o motor (com tools).
  // Usa o segredo da FORJA — é o mesmo chamador (o portal, com FORGE_SECRET).
  '/engenheiro/conversar',
  // ⭐ O PORTÃO VERIFICADOR: confere a resposta gerada contra os fatos grounded
  // antes de o portal a publicar. Segunda geração medida → família da FORJA.
  '/engenheiro/verificar',
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
  const doEngenheiro = rota.startsWith('/engenheiro/');

  // ⭐ Cada família de rota confere o SEU segredo. Quem tem o do correio não
  // gera, e quem tem o da forja não dispara entrega. O Engenheiro é o mesmo
  // chamador da forja (o portal), então usa o mesmo segredo.
  //
  // ⚠️ `forgeSecret` ausente = forja DESLIGADA, não forja aberta. Um `?? ''`
  // aqui faria a rota aceitar qualquer coisa num ambiente que só esqueceu de
  // configurar — e é exatamente a lição do `?? ''` que o kraken registrou.
  const esperado = daForja || doEngenheiro ? deps.forgeSecret : deps.secret;
  if (typeof esperado !== 'string' || esperado.length === 0) {
    return { status: 503, body: { error: 'rota não configurada neste ambiente' } };
  }

  if (!segredoConfere(req.secret, esperado)) {
    // Mensagem curta e igual para segredo ausente e segredo errado: dizer
    // "faltou o cabeçalho" ensina quem está tentando.
    return { status: 401, body: { error: 'não autorizado' } };
  }

  if (daForja) return atenderForja(rota, req, deps);
  if (rota === '/engenheiro/conversar') return atenderEngenheiro(req, deps);
  if (rota === '/engenheiro/verificar') return atenderVerificar(req, deps);

  if (rota === '/correio/saude') {
    if (req.method !== 'GET') return { status: 405, body: { error: 'use GET' } };
    const saude = await readQueueHealth(deps.pool);
    return { status: 200, body: { ...saude, veredito: judgeHealth(saude) } };
  }

  // ⭐ O observador proativo — MUDA o estado (grava avisos), então é POST. Um GET
  // que grava seria reexecutado por qualquer prefetch/crawler/retry de proxy.
  if (rota === '/insight/computar') {
    if (req.method !== 'POST') return { status: 405, body: { error: 'use POST' } };
    const relatorio = await runInsightOnce(deps.pool);
    return { status: 200, body: relatorio };
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

interface ConversaBody {
  system?: unknown;
  messages?: unknown;
  tools?: unknown;
  maxTokens?: unknown;
}

/**
 * ⭐ **O RELAY DO ENGENHEIRO.**
 *
 * Uma rodada de conversa com o motor, COM `tools`. É o passo que o portal não
 * pode dar sozinho: a chave do motor vive aqui (Lei do Motor). O portal manda o
 * `system`, o histórico e as ferramentas; recebe de volta os blocos crus
 * (texto + `tool_use`) e o motivo de parada, e é ELE quem executa as
 * ferramentas — sob a sessão do usuário (RLS). Este relay não fala com o banco.
 *
 * ⚖️ **A composição do motor não sai daqui.** O portal recebe blocos do
 * protocolo, nunca o nome do fornecedor: um erro do motor vira `502` com
 * mensagem neutra, no molde do `safeFailureReason` da forja.
 */
async function atenderEngenheiro(
  req: { method: string; path: string; secret?: string; body?: unknown },
  deps: HandlerDeps,
): Promise<HandlerResult> {
  if (req.method !== 'POST') return { status: 405, body: { error: 'use POST' } };

  const env = deps.env ?? process.env;
  const corpo = (req.body ?? {}) as ConversaBody;

  const system = typeof corpo.system === 'string' ? corpo.system : '';
  const messages = Array.isArray(corpo.messages) ? corpo.messages : null;
  if (system.length === 0 || messages === null) {
    return { status: 400, body: { error: 'system e messages são obrigatórios' } };
  }
  const tools = Array.isArray(corpo.tools) ? corpo.tools : [];
  const maxTokens = typeof corpo.maxTokens === 'number' ? corpo.maxTokens : undefined;

  try {
    const reply = await converseText(env, {
      system,
      messages,
      tools,
      ...(maxTokens !== undefined ? { maxTokens } : {}),
    });
    return { status: 200, body: reply };
  } catch (err) {
    // O detalhe (que pode citar o motor) vai só ao log; a resposta é neutra.
    console.error('[engenheiro] falha no motor:', err);
    return { status: 502, body: { error: 'o motor ALSHAM não respondeu' } };
  }
}

interface VerificarBody {
  tenantId?: unknown;
  tenantName?: unknown;
  userId?: unknown;
  question?: unknown;
  answer?: unknown;
  groundedFacts?: unknown;
}

/**
 * ⭐ **O PORTÃO VERIFICADOR.**
 *
 * O portal já tem a resposta gerada e os fatos grounded que a alimentaram.
 * Aqui a segunda geração — o juiz — confere a fidelidade, MEDIDA como qualquer
 * geração da Forja (`verifyAnswer` grava `ai_generations` + `usage_ledger`). O
 * portal recebe só `{ publish }` e decide o que mostrar (`gatedReply`).
 *
 * ⛔ **FAIL-CLOSED, a lei que o bastão cravou:** se o verificador não pôde
 * rodar — juiz fora do ar, cota estourada, erro — a resposta é `publish:false`,
 * nunca um erro cru e nunca um "OK" por omissão. O portal, recebendo `false`,
 * troca a resposta pela frase honesta.
 *
 * ⚠️ **O `tenantId` vem no corpo, e é seguro pela mesma razão da Forja:** quem
 * chama é o portal, do servidor, com o tenant já resolvido da sessão × memberships;
 * o segredo garante que só o portal chama. Ver `atenderForja`.
 */
async function atenderVerificar(
  req: { method: string; path: string; secret?: string; body?: unknown },
  deps: HandlerDeps,
): Promise<HandlerResult> {
  // Verificar QUEIMA COTA (segunda geração) — POST, sempre.
  if (req.method !== 'POST') return { status: 405, body: { error: 'use POST' } };

  const env = deps.env ?? process.env;
  const corpo = (req.body ?? {}) as VerificarBody;
  const tenantId = typeof corpo.tenantId === 'string' ? corpo.tenantId : null;
  if (tenantId === null) return { status: 400, body: { error: 'tenantId ausente' } };

  const resultado = await verifyAnswer(
    { pool: deps.pool, env },
    {
      tenantId,
      userId: typeof corpo.userId === 'string' ? corpo.userId : null,
      tenantName: typeof corpo.tenantName === 'string' ? corpo.tenantName : '',
      question: typeof corpo.question === 'string' ? corpo.question : '',
      answer: typeof corpo.answer === 'string' ? corpo.answer : '',
      groundedFacts: typeof corpo.groundedFacts === 'string' ? corpo.groundedFacts : '',
    },
  );

  // ⛔ Não pôde verificar ⇒ não publica. 200 (o pedido foi atendido; o veredito
  // é "não confirmado"), nunca 500 — 500 mandaria o portal tentar de novo e
  // dobrar o custo. O portal lê `publish:false` e mostra a frase honesta.
  if (!resultado.ok) {
    return { status: 200, body: { publish: false, reason: resultado.reason } };
  }

  return {
    status: 200,
    body: { publish: resultado.publish, verdict: resultado.verdict, generationId: resultado.generationId },
  };
}
