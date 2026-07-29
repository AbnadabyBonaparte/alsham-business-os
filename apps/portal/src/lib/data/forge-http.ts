import type { EngineState, GenerationKind } from '@alsham/ai';

import { DataPortError } from './port';
import type { ForgePort, GenerationResponse } from './forge-port';

/**
 * O adapter REAL da forja — fala com `apps/api` por HTTP, do SERVIDOR.
 *
 * ⛔ **A chave do motor não existe neste arquivo, e não pode existir.** O que
 * existe é o `FORGE_SECRET`, que autentica o portal perante a composição — e
 * ele é lido de `process.env` num módulo de servidor, nunca com prefixo
 * `NEXT_PUBLIC_`. Há guarda de CI sobre isso.
 *
 * ⚠️ **O `tenantId` vai no corpo, resolvido da SESSÃO** — cruzado com
 * `core.memberships` em `lib/session.ts`, no servidor. Nunca de URL, nunca de
 * formulário.
 */
export function createForgeHttpPort(input: {
  readonly baseUrl: string;
  readonly secret: string;
  readonly tenantId: string;
  readonly userId: string | null;
}): ForgePort {
  const chamar = async (rota: string, corpo: unknown): Promise<unknown> => {
    const r = await fetch(`${input.baseUrl.replace(/\/+$/, '')}${rota}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forge-secret': input.secret },
      body: JSON.stringify({ ...(corpo as object), tenantId: input.tenantId, userId: input.userId }),
      cache: 'no-store',
    });
    const dados = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) {
      // 503 é ambiente não configurado — e a frase tem de dizer isso, não
      // "erro inesperado". É a mesma honestidade do estado da forja.
      throw new DataPortError(
        dados.error ??
          (r.status === 503
            ? 'Geração não configurada neste ambiente — ver o runbook da forja.'
            : 'A geração não pôde ser concluída.'),
      );
    }
    return dados;
  };

  return {
    kind: 'http',

    async readEngineState(kind: GenerationKind) {
      const r = (await chamar('/forja/estado', { kind })) as { estado: EngineState };
      return r.estado;
    },

    async generate(pedido) {
      return (await chamar('/forja/gerar', {
        kind: pedido.kind,
        instruction: pedido.instruction,
        workContext: pedido.workContext,
        sourceModule: 'ops',
        sourceRef: pedido.sourceRef,
      })) as GenerationResponse;
    },
  };
}
