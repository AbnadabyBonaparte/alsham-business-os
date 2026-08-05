/**
 * **O PORTÃO VERIFICADOR DO ENGENHEIRO — a rede de FIDELIDADE, irmã da de marca.**
 *
 * ⭐ A doutrina grounded (ver `grounded.ts`) diz: o texto DETERMINÍSTICO é a
 * verdade, e a Forja só REFINA a voz. Mas "refinar" é uma geração — e geração
 * pode, sem querer, trocar um número, arredondar, afirmar uma tendência que o
 * dado não sustenta, ou falar do tenant errado. `checkBrandSafety` já confere se
 * a resposta feriu a MARCA; falta conferir se ela feriu o FATO. Este é esse passe.
 *
 * O padrão vem do relatório de validação (`design-report/validacao-tecnicas-
 * agentes-2026.md`, coluna LIBERADO): o portão verificador (LLM-as-a-Judge /
 * Anthropic "Outcomes" reduzido ao osso, veredito-como-token do GenRM). Aqui
 * mora só a LÓGICA PURA (Regra de Ouro §5.3): montar o prompt do juiz, ler o
 * veredito e decidir o portão. A CHAMADA ao motor vive no `apps/api` (o único
 * lugar com chave), como a Forja — este arquivo não chama motor, não lê chave,
 * não faz rede. Puro, testável sem rede.
 *
 * ⛔ **FAIL-CLOSED — a lei "nunca inventa OK" do insight, aplicada ao juiz.**
 * Veredito ausente, vazio ou ilegível NÃO é aprovação: é bloqueio. Um juiz que
 * na dúvida libera é pior que juiz nenhum, porque dá selo de confiança a uma
 * resposta que ninguém conferiu. Só um `pass` explícito e bem-formado publica.
 *
 * ⚖️ **Regra "output-only" (a separação da Outcomes):** o juiz vê a PERGUNTA, a
 * RESPOSTA e os FATOS grounded — NUNCA o raciocínio de quem escreveu. Ver o
 * raciocínio contaminaria o julgamento (o juiz "compraria" a narrativa do
 * escritor em vez de conferir contra o dado).
 */

/** O veredito do juiz — `pass`/`fail` (o token do GenRM) mais os motivos legíveis. */
export interface VerifierVerdict {
  readonly verdict: 'pass' | 'fail';
  /** Por que reprovou (ou, num pass, observações). Nunca o texto do dado cru. */
  readonly reasons: readonly string[];
}

/** O que o portão precisa para montar o prompt do juiz. Só a SAÍDA + os FATOS. */
export interface VerifierInput {
  /** A pergunta do usuário — o alvo que a resposta deveria acertar. */
  readonly question: string;
  /** A resposta RASCUNHO do Engenheiro (a saída a conferir). NÃO o raciocínio. */
  readonly answer: string;
  /**
   * Os FATOS grounded — o MESMO texto determinístico que alimentou a geração
   * (`grounded.ts`). É a única fonte de verdade contra a qual o juiz confere.
   */
  readonly groundedFacts: string;
  /** Nome do tenant ativo — para o juiz conferir que a resposta não trocou de dono. */
  readonly tenantName: string;
}

/**
 * A rubrica — os critérios que o juiz aplica, um a um. Fixa e explícita (não é
 * dado do tenant): é a definição de "resposta fiel" da plataforma. Cada linha é
 * uma pergunta de pass/fail que o relatório de validação nomeia.
 */
export const VERIFIER_RUBRIC: readonly string[] = [
  'Todo número citado na resposta aparece nos FATOS (nenhum inventado, trocado ou arredondado a ponto de mudar de valor).',
  'Nenhuma afirmação da resposta vai além do que os FATOS sustentam (sem tendência, causa ou conclusão que o dado não mostre).',
  'A resposta fala do tenant informado e de nenhum outro.',
];

/**
 * Monta o prompt do juiz — PURO, devolve string (irmão de `composeGroundedPrompt`).
 *
 * Ordem deliberada: primeiro a lei (fail-closed + formato), depois os FATOS, a
 * pergunta e a resposta, por último a rubrica e o formato de saída. O juiz é
 * instruído a devolver SÓ o JSON `{"verdict","reasons"}` — o token do GenRM.
 */
export function buildVerifierPrompt(input: VerifierInput): string {
  const rubrica = VERIFIER_RUBRIC.map((r, i) => `${i + 1}. ${r}`).join('\n');
  return [
    'Você é o verificador de fidelidade. Confira se a RESPOSTA é fiel aos FATOS.',
    'Você NÃO reescreve a resposta e NÃO vê o raciocínio de quem a escreveu — só julga a saída contra o dado.',
    'Na dúvida, ou se faltar informação para confirmar um critério, o veredito é "fail" (nunca aprove sem base).',
    '',
    `TENANT: ${input.tenantName}`,
    '',
    'FATOS (a única fonte de verdade):',
    input.groundedFacts.trim(),
    '',
    'PERGUNTA:',
    input.question.trim(),
    '',
    'RESPOSTA A CONFERIR:',
    input.answer.trim(),
    '',
    'RUBRICA (todos os critérios precisam passar):',
    rubrica,
    '',
    'Responda SÓ com JSON, sem texto ao redor:',
    '{"verdict":"pass"|"fail","reasons":["motivo curto por critério que falhou"]}',
  ].join('\n');
}

/**
 * Lê o veredito bruto do juiz — PURO, **fail-closed**.
 *
 * Extrai o primeiro objeto JSON do texto (o juiz pode envolver em prosa ou cercas
 * de markdown) e só devolve `pass` quando o JSON é bem-formado E diz `pass`
 * explicitamente. Qualquer outra coisa — não-parseável, `verdict` ausente,
 * valor estranho, string vazia — vira `fail` com o motivo. Nunca "assume OK".
 */
export function parseVerdict(raw: string): VerifierVerdict {
  const bloco = extrairJson(raw);
  if (bloco === null) {
    return { verdict: 'fail', reasons: ['veredito ilegível: o juiz não devolveu JSON'] };
  }

  let obj: unknown;
  try {
    obj = JSON.parse(bloco);
  } catch {
    return { verdict: 'fail', reasons: ['veredito ilegível: JSON malformado'] };
  }

  if (typeof obj !== 'object' || obj === null) {
    return { verdict: 'fail', reasons: ['veredito ilegível: não é objeto'] };
  }

  const veredito = (obj as Record<string, unknown>).verdict;
  const motivos = (obj as Record<string, unknown>).reasons;
  const reasons = Array.isArray(motivos)
    ? motivos.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    : [];

  // ⛔ Só `pass` LITERAL publica. Tudo o mais é bloqueio.
  if (veredito === 'pass') {
    return { verdict: 'pass', reasons };
  }
  if (veredito === 'fail') {
    return { verdict: 'fail', reasons: reasons.length > 0 ? reasons : ['reprovado sem motivo dado'] };
  }
  return { verdict: 'fail', reasons: ['veredito ausente ou desconhecido — bloqueado por segurança'] };
}

/**
 * A decisão do portão — PURA. `publish` só é `true` num veredito `pass`.
 * É o ponto onde o `apps/api`/rota decide entre entregar a resposta ou trocá-la
 * por "não pude confirmar esta resposta" (nunca a afirmação não-verificada).
 */
export function decideGate(verdict: VerifierVerdict): { readonly publish: boolean } {
  return { publish: verdict.verdict === 'pass' };
}

/**
 * A frase honesta que substitui a resposta quando o portão não a libera.
 * NUNCA um erro técnico cru, NUNCA a resposta não verificada — um convite a
 * reformular. É a mesma doutrina do insight: "nunca inventa OK".
 */
export const VERIFY_BLOCKED_MESSAGE =
  'Não consegui confirmar essa resposta com segurança — pode reformular a pergunta?';

/**
 * A DECISÃO DA ROTA — PURA, e o coração do fail-closed do lado da tela.
 *
 * Recebe a resposta gerada e o veredito do verificador (`{ publish }`), OU
 * `null` quando o verificador **não pôde rodar** (fora do ar, rede caída, não
 * configurado). Devolve a resposta só quando o veredito diz `publish: true`;
 * em TODO o resto — reprovado OU veredito ausente — devolve a frase honesta.
 *
 * ⛔ `null` NÃO publica. Essa é a regra que o bastão pediu explícita: se não
 * deu pra verificar, o Engenheiro fica cauteloso, nunca solta o não verificado.
 */
export function gatedReply(answer: string, verify: { readonly publish: boolean } | null): string {
  return verify?.publish ? answer : VERIFY_BLOCKED_MESSAGE;
}

/**
 * Extrai o primeiro objeto JSON balanceado de um texto — tolerante a prosa e a
 * cercas ```json ao redor. Devolve `null` se não houver um objeto fechado.
 * Puro; não avalia nada, só recorta a substring `{...}`.
 */
function extrairJson(texto: string): string | null {
  const inicio = texto.indexOf('{');
  if (inicio === -1) return null;
  let profundidade = 0;
  for (let i = inicio; i < texto.length; i++) {
    const c = texto[i];
    if (c === '{') profundidade++;
    else if (c === '}') {
      profundidade--;
      if (profundidade === 0) return texto.slice(inicio, i + 1);
    }
  }
  return null;
}
