/**
 * O braço do PORTÃO VERIFICADOR no portal — e, como a Forja, o portal NÃO
 * verifica sozinho.
 *
 * ⚖️ A mesma fronteira do `forge.ts`: a chave do motor vive só em `apps/api`. O
 * verificador é uma SEGUNDA geração (o juiz de fidelidade), então mora do outro
 * lado da porta `FORGE_SECRET`. Este arquivo só empacota a resposta gerada + os
 * fatos grounded e pergunta ao `apps/api` se pode publicar.
 *
 * ⛔ **FAIL-CLOSED, a lei do bastão:** se a porta não está configurada, se a rede
 * cai, se o `apps/api` responde erro, ou se o corpo vem estranho — devolve
 * `null`. E `gatedReply(answer, null)` (no `@alsham/engineer`) NÃO publica: mostra
 * a frase honesta. "Não deu pra verificar" nunca vira "pode publicar".
 */

export interface VerifyRequest {
  readonly question: string;
  readonly answer: string;
  /** Os fatos grounded que alimentaram a geração (as leituras das ferramentas). */
  readonly groundedFacts: string;
  readonly tenantId: string;
  readonly tenantName: string;
  readonly userId: string | null;
}

/**
 * Pergunta ao `apps/api` se a resposta pode ser publicada. Devolve `{ publish }`
 * quando o veredito chega inteiro, ou **`null`** em QUALQUER falha — o sinal
 * fail-closed que a rota traduz em "não pude confirmar".
 */
export async function callVerify(input: VerifyRequest): Promise<{ publish: boolean } | null> {
  const apiUrl = process.env.ALSHAM_API_URL?.trim();
  const secret = process.env.FORGE_SECRET?.trim();

  // Porta não configurada → não dá pra verificar → não publica.
  if (!apiUrl || !secret) return null;

  let resposta: Response;
  try {
    resposta = await fetch(`${apiUrl.replace(/\/+$/, '')}/engenheiro/verificar`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forge-secret': secret,
      },
      body: JSON.stringify(input),
    });
  } catch {
    // Rede caiu → fail-closed.
    return null;
  }

  // O apps/api responde 200 mesmo quando NÃO pôde verificar (com publish:false).
  // Um status != 2xx aqui é falha de transporte/segredo → fail-closed.
  if (!resposta.ok) return null;

  try {
    const dados = (await resposta.json()) as { publish?: unknown };
    // Só um `publish === true` LITERAL publica. Qualquer outra coisa não.
    return { publish: dados.publish === true };
  } catch {
    // Corpo ilegível → fail-closed.
    return null;
  }
}
