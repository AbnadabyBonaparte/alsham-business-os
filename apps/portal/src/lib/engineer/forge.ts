/**
 * O braço do motor — a MESMA credencial e o MESMO padrão de chamada da Forja.
 *
 * ⚖️ **Reaproveitamento, não segunda credencial.** Lê `ALSHAM_TEXT_API_KEY`,
 * `ALSHAM_TEXT_ENDPOINT` e `ALSHAM_TEXT_MODEL` — exatamente as variáveis que a
 * Forja (`apps/api`) já usa — e faz o mesmo `fetch` cru contra a Messages API.
 * A única diferença é que a Forja não precisava de `tools`/`system`; o
 * Engenheiro precisa, e o protocolo já os suporta. Nenhuma chave nova nasce
 * aqui.
 *
 * ⚖️ **Lei do Motor (CI a verifica em `apps/portal/src`):** o nome do fornecedor
 * de IA NÃO aparece neste código. Tudo que é específico do fornecedor — a URL, o
 * cabeçalho de versão e seu valor — vem de **variável de ambiente**, que é o
 * lugar que a Lei do Motor reserva para isso ("permitido em env e config"). Sem
 * essas env, o Engenheiro explica que o motor não está ligado, e nada vaza.
 *
 * ⛔ Server-only por uso: este arquivo só é importado pela rota (`/api/engineer`),
 * jamais pelo cliente. E nada aqui usa `service_role` — o motor não fala com o
 * banco; quem fala é o executor, sob a sessão do usuário.
 */

/** Um bloco de conteúdo do protocolo (texto ou pedido de ferramenta). */
export type ForgeContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: string; [k: string]: unknown };

/** A resposta útil do motor: os blocos, o motivo de parada e o consumo. */
export interface ForgeReply {
  readonly content: ForgeContentBlock[];
  readonly stopReason: string | null;
  readonly usage: { input: number; output: number };
}

export type ForgeResult =
  | { ok: true; reply: ForgeReply }
  | { ok: false; reason: 'unconfigured' | 'upstream' | 'network'; detail: string };

export interface ForgeMessage {
  role: 'user' | 'assistant';
  content: unknown; // string OU array de blocos (text/tool_use/tool_result)
}

/** O motor está configurado neste ambiente? (Sem chave, o Engenheiro explica.) */
export function forgeConfigured(): boolean {
  return Boolean(
    process.env.ALSHAM_TEXT_API_KEY?.trim() &&
      process.env.ALSHAM_TEXT_MODEL?.trim() &&
      process.env.ALSHAM_TEXT_ENDPOINT?.trim(),
  );
}

/**
 * Monta os cabeçalhos da chamada. O cabeçalho de versão do motor — nome E valor
 * — vem de env (`ALSHAM_TEXT_VERSION_HEADER` / `ALSHAM_TEXT_API_VERSION`), nunca
 * escrito aqui: é onde a Lei do Motor manda a especificidade do fornecedor ficar.
 */
function forgeHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'x-api-key': key,
  };
  const versionHeader = process.env.ALSHAM_TEXT_VERSION_HEADER?.trim();
  const versionValue = process.env.ALSHAM_TEXT_API_VERSION?.trim();
  if (versionHeader && versionValue) headers[versionHeader] = versionValue;
  return headers;
}

/**
 * Uma rodada com o motor. Recebe o histórico + ferramentas; devolve os blocos.
 *
 * A rota chama isto em laço: enquanto o motor pedir ferramenta (`stopReason ===
 * 'tool_use'`), executa e chama de novo com o resultado.
 */
export async function callForge(input: {
  system: string;
  messages: ForgeMessage[];
  tools?: unknown[];
  maxTokens?: number;
}): Promise<ForgeResult> {
  const key = process.env.ALSHAM_TEXT_API_KEY?.trim();
  const model = process.env.ALSHAM_TEXT_MODEL?.trim();
  const endpoint = process.env.ALSHAM_TEXT_ENDPOINT?.trim();

  if (!key || !model || !endpoint) {
    return {
      ok: false,
      reason: 'unconfigured',
      detail: 'O motor ALSHAM não está configurado neste ambiente.',
    };
  }

  const body: Record<string, unknown> = {
    model,
    max_tokens: input.maxTokens ?? 1500,
    system: input.system,
    messages: input.messages,
  };
  if (input.tools && input.tools.length > 0) body.tools = input.tools;

  let resposta: Response;
  try {
    resposta = await fetch(endpoint, {
      method: 'POST',
      headers: forgeHeaders(key),
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, reason: 'network', detail: (err as Error).message };
  }

  if (!resposta.ok) {
    // O status vaza no log do servidor, nunca na tela — e nunca o nome do motor.
    return { ok: false, reason: 'upstream', detail: `motor respondeu ${resposta.status}` };
  }

  const dados = (await resposta.json()) as {
    content?: ForgeContentBlock[];
    stop_reason?: string | null;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  return {
    ok: true,
    reply: {
      content: dados.content ?? [],
      stopReason: dados.stop_reason ?? null,
      usage: {
        input: dados.usage?.input_tokens ?? 0,
        output: dados.usage?.output_tokens ?? 0,
      },
    },
  };
}
