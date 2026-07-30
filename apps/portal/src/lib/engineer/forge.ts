/**
 * O braço do motor NO PORTAL — mas o portal NÃO fala com o motor.
 *
 * ⚖️ **A fronteira do repo, e o CI a verifica:** a chave do motor
 * (`ALSHAM_TEXT_*`) vive só em `apps/api`. O portal fala com `apps/api` pela
 * porta autenticada com `FORGE_SECRET` — exatamente como a Forja (`forge-http.ts`)
 * já faz. Este arquivo NÃO lê chave de motor, NÃO chama fornecedor e NÃO cita
 * nenhum: ele só empacota a rodada de conversa e a entrega ao `apps/api`, que
 * relaia ao motor (com `tools`) e devolve os blocos crus.
 *
 * ⛔ Server-only por uso: só a rota `/api/engineer` (e o executor) importam
 * isto. E nada aqui usa `service_role` — quem lê o dado do tenant é o executor,
 * sob a sessão do usuário.
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

/**
 * O Engenheiro está ligado neste ambiente? Depende da PORTA para o `apps/api`
 * (URL + segredo). A chave do motor é do outro lado da porta — não se olha aqui.
 */
export function forgeConfigured(): boolean {
  return Boolean(process.env.ALSHAM_API_URL?.trim() && process.env.FORGE_SECRET?.trim());
}

/**
 * Uma rodada com o motor, VIA `apps/api`. Recebe o histórico + ferramentas;
 * devolve os blocos. A rota chama isto em laço: enquanto o motor pedir
 * ferramenta (`stopReason === 'tool_use'`), o portal executa sob a sessão e
 * chama de novo com o resultado.
 */
export async function callForge(input: {
  system: string;
  messages: ForgeMessage[];
  tools?: unknown[];
  maxTokens?: number;
}): Promise<ForgeResult> {
  const apiUrl = process.env.ALSHAM_API_URL?.trim();
  const secret = process.env.FORGE_SECRET?.trim();

  if (!apiUrl || !secret) {
    return {
      ok: false,
      reason: 'unconfigured',
      detail: 'A porta para o motor ALSHAM não está configurada neste ambiente.',
    };
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${apiUrl.replace(/\/+$/, '')}/engenheiro/conversar`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // A chave da PORTA entre os apps — não a chave do motor.
        'x-forge-secret': secret,
      },
      body: JSON.stringify({
        system: input.system,
        messages: input.messages,
        tools: input.tools ?? [],
        maxTokens: input.maxTokens ?? 1500,
      }),
    });
  } catch (err) {
    return { ok: false, reason: 'network', detail: (err as Error).message };
  }

  if (!resposta.ok) {
    return { ok: false, reason: 'upstream', detail: `apps/api respondeu ${resposta.status}` };
  }

  const dados = (await resposta.json()) as {
    content?: ForgeContentBlock[];
    stopReason?: string | null;
    usage?: { input?: number; output?: number };
  };

  return {
    ok: true,
    reply: {
      content: dados.content ?? [],
      stopReason: dados.stopReason ?? null,
      usage: { input: dados.usage?.input ?? 0, output: dados.usage?.output ?? 0 },
    },
  };
}
