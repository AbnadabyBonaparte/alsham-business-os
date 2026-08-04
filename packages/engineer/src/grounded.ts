import { composePrompt, findViolations, type BrandContext } from '@alsham/ai';

/**
 * **A PONTE PARA A FORJA — reaproveitamento, não obra nova.**
 *
 * ⭐ O bastão é explícito: a camada generativa NÃO se reescreve. `composePrompt()`
 * da Forja já monta o prompt com o Cérebro da Marca (quem somos / como falamos /
 * o que nunca dizemos), e `findViolations()` já é a rede que confere o resultado.
 * O Engenheiro ESTENDE isso: o prompt de geração é `composePrompt()` alimentado
 * com o **texto do motor local** (grounded — o padrão `llm.ts` do PERITUS: a IA
 * só refina o que o determinístico já calculou) MAIS os blocos de consciência
 * (localização + formulário).
 *
 * ⚠️ Este arquivo NÃO chama motor, NÃO lê chave e NÃO reimplementa nada da Forja:
 * ele COMPÕE as funções que já existem em `@alsham/ai`. Puro, testável sem rede.
 */

/**
 * Monta o prompt de geração GROUNDED do Engenheiro, reusando `composePrompt`.
 *
 * O `workContext` da Forja recebe o texto determinístico do motor local (a única
 * fonte de verdade que a IA pode refinar) somado aos blocos de consciência. A
 * `instruction` é o que se quer produzir. A `brand` é o Cérebro da Marca do
 * tenant — o mesmo que qualquer geração da Forja usa.
 */
export function composeGroundedPrompt(input: {
  readonly brand: BrandContext;
  /** O texto do motor local — a fonte grounded que a IA só pode refinar. */
  readonly localText: string;
  /** Os blocos de consciência (localização + formulário), já montados. */
  readonly contextBlocks?: readonly string[];
  /** O que produzir. */
  readonly instruction: string;
}): string {
  const contexto = [input.localText, ...(input.contextBlocks ?? [])]
    .map((b) => b.trim())
    .filter((b) => b.length > 0)
    .join('\n\n');

  return composePrompt({
    kind: 'text',
    instruction: input.instruction,
    workContext: contexto,
    brand: input.brand,
  });
}

/**
 * ⭐ **A REDE DE SEGURANÇA DA MARCA — a mesma da Forja.**
 *
 * Confere um texto (a resposta do Engenheiro, ou um documento gerado) contra os
 * termos que a marca veta. DETECTA, nunca apaga — exatamente como `findViolations`
 * decide: apagar deixaria um buraco na frase; acusar deixa o operador decidir.
 * Devolve os termos encontrados (vazio = limpo).
 */
export function checkBrandSafety(
  texto: string,
  forbidden: readonly string[],
): readonly string[] {
  return findViolations(texto, forbidden);
}

export type { BrandContext };
