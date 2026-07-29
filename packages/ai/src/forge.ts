import type { LimitVerdict } from '@alsham/billing';
import type {
  BrandContext,
  EngineLabel,
  EngineState,
  GenerationKind,
  GenerationRequest,
} from './types.ts';

/**
 * **A FORJA** — as decisões da IA Base, puras.
 *
 * ⭐ Regra de Ouro (CLAUDE.md §5.3): tudo o que DECIDE mora aqui. Quem executa
 * a chamada de rede é `apps/api`, que tem a chave; quem desenha é o portal, que
 * nunca a vê. Este arquivo não faz `fetch`, não lê `process.env` e não conhece
 * nome de fornecedor nenhum.
 *
 * **Teste de bolso:** se `apps/` inteiro sumisse, a regra "sem medição, sem
 * geração" continuaria escrita aqui — e é ela que impede o produto de consumir
 * o que ninguém contabiliza.
 */

/** A métrica de plano que a geração consome. Uma só, e é decisão. */
export const AI_METRIC = 'ai-generations-per-month';

/**
 * ⚖️ **O RÓTULO QUE A TELA MOSTRA — e a Lei do Motor em código.**
 *
 * Minerado do `functionalLabel()` do kraken-v2, que resolve exatamente este
 * problema: *"o fornecedor não aparece no texto visível do cockpit — só a
 * etapa"*.
 *
 * Repare que a função **não recebe** o adaptador. Não é que ela o ignore: ela
 * não tem como saber quem executou, e é por isso que nenhum nome de fornecedor
 * pode vazar por aqui, nem por descuido de quem a chamar.
 */
export function engineLabel(kind: GenerationKind): EngineLabel {
  return { step: kind === 'text' ? 'Texto' : 'Arte', engine: 'motor ALSHAM' };
}

/**
 * ⭐ **O ESTADO HONESTO DE UMA MODALIDADE NESTE AMBIENTE.**
 *
 * A ordem das perguntas é a decisão desta função, e ela vai do mais específico
 * ao mais geral:
 *
 * 1. **modo demonstração** vence tudo — sem banco, não há plano nem métrica
 *    para consultar, e o rótulo "demonstração" é o que impede o mock de se
 *    passar por IA;
 * 2. **sem chave** vem antes do limite: dizer "você estourou a cota" num
 *    ambiente que nunca poderia gerar mandaria o operador procurar o problema
 *    no lugar errado;
 * 3. ⛔ **sem medição, sem geração** — `checkLimit()` nega por omissão quando o
 *    plano não declara teto para a métrica, e aqui essa negação vira um estado
 *    com nome. Gerar sem poder medir é consumo que ninguém cobra e ninguém vê;
 * 4. **estourou** por último, porque é o único que o tenant resolve sozinho.
 *
 * ---
 *
 * ⚠️ **Este pacote importa `@alsham/billing`, e isso NÃO fere a Lei do Lego.**
 *
 * A lei proíbe **módulo** conhecer **módulo** — e nenhum dos dois é módulo:
 * `billing` é a contabilidade de uso e `ai` é a IA Base, os dois capacidades do
 * **Core** (Taxonomia §3). Nenhum dos dois aparece na Store, e a guarda de CI
 * "módulo não conhece módulo" tem a lista dos seis módulos reais, sem eles.
 *
 * A alternativa seria copiar `LimitVerdict` para cá — e aí a resposta de
 * "estourou o teto" existiria em dois lugares, que um dia divergiriam
 * justamente na hora de cortar o consumo de alguém.
 */
export function engineState(input: {
  readonly demoMode: boolean;
  readonly hasKey: boolean;
  readonly verdict: LimitVerdict;
  readonly runbookSection: string;
}): EngineState {
  if (input.demoMode) return { status: 'demo' };
  if (!input.hasKey) {
    return { status: 'unconfigured', runbookSection: input.runbookSection };
  }
  if (input.verdict.reason === 'no-limit-configured') {
    return { status: 'unmetered', metric: AI_METRIC };
  }
  if (input.verdict.reason === 'blocked') {
    return {
      status: 'exhausted',
      metric: AI_METRIC,
      limit: input.verdict.limit,
      used: input.verdict.used,
    };
  }
  return { status: 'ready' };
}

/**
 * A geração pode acontecer NESTE estado?
 *
 * ⭐ `demo` gera — mas gera o mock, e a tela é obrigada a dizê-lo.
 */
export function canGenerate(state: EngineState): boolean {
  return state.status === 'ready' || state.status === 'demo';
}

/**
 * A frase que a tela mostra quando não dá para gerar.
 *
 * ⚠️ Cada estado tem a **sua**, com o que resolver. "Geração indisponível" é a
 * mensagem que faz o operador abrir um chamado para descobrir o óbvio.
 */
export function whyCannotGenerate(state: EngineState): string | null {
  switch (state.status) {
    case 'ready':
    case 'demo':
      return null;
    case 'unconfigured':
      return `Geração não configurada neste ambiente — ver runbook ${state.runbookSection}.`;
    case 'unmetered':
      return `Geração desligada: o plano deste tenant não declara teto para "${state.metric}". Sem medição, não se gera — consumo que ninguém conta é consumo que ninguém vê.`;
    case 'exhausted':
      return `Este tenant usou ${state.used} de ${state.limit} gerações do mês. A cota renova no início do próximo mês.`;
  }
}

/**
 * ⭐ **O PROMPT DA MARCA — o Cérebro da Marca entrando em toda geração.**
 *
 * Minerado do kraken-v2 (`personas.voice_profile` + `forbidden_terms`), com a
 * mesma arquitetura de **duas camadas**:
 *
 * 1. os termos proibidos entram na instrução como restrição;
 * 2. e o resultado é conferido contra a mesma lista depois
 *    (`findViolations()`), porque restrição em prompt é **pedido**, e a
 *    conferência é **garantia**.
 *
 * ⚠️ **A montagem é determinística** — mesma entrada, mesma saída, sem relógio
 * e sem aleatório. É o que permite testar o prompt sem chamar motor nenhum, e
 * o que faz um resultado ruim ser reproduzível.
 */
export function composePrompt(req: GenerationRequest): string {
  const partes: string[] = [];

  if (req.brand.identity.trim().length > 0) {
    partes.push(`Quem somos: ${req.brand.identity.trim()}`);
  }
  if (req.brand.tone.trim().length > 0) {
    partes.push(`Como falamos: ${req.brand.tone.trim()}`);
  }
  const vetos = normalizeForbidden(req.brand.forbidden);
  if (vetos.length > 0) {
    partes.push(`Nunca use, em hipótese alguma: ${vetos.join(', ')}.`);
  }
  if (req.workContext.trim().length > 0) {
    partes.push(`Sobre este trabalho: ${req.workContext.trim()}`);
  }
  partes.push(`O que é preciso produzir: ${req.instruction.trim()}`);

  return partes.join('\n\n');
}

/** Termos proibidos, limpos: sem vazios, sem repetição, sem espaço à toa. */
export function normalizeForbidden(termos: readonly string[]): readonly string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const t of termos) {
    const limpo = t.trim();
    if (limpo.length === 0) continue;
    const chave = limpo.toLowerCase();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(limpo);
  }
  return saida;
}

/**
 * ⭐ **A REDE DE SEGURANÇA — ela DETECTA, nunca redige.**
 *
 * Minerado literalmente do `findViolations()` do kraken-v2, e a escolha de
 * detectar em vez de apagar é a parte importante: apagar o termo deixa a frase
 * com um buraco, e o cliente recebe uma peça que não faz sentido sem saber por
 * quê. Acusando, o operador decide — refazer com instrução nova, ou aceitar.
 */
export function findViolations(
  texto: string,
  forbidden: readonly string[],
): readonly string[] {
  const achados: string[] = [];
  for (const termo of normalizeForbidden(forbidden)) {
    const escapado = termo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escapado}\\b`, 'i').test(texto)) achados.push(termo);
  }
  return achados;
}

/**
 * O erro de validação de um pedido de geração, ou `null`.
 *
 * ⚠️ O teto de instrução existe para o pedido não virar o documento inteiro:
 * um prompt de 50 mil caracteres custa dinheiro real e quase sempre é alguém
 * colando o conteúdo errado.
 */
export function validateRequest(req: GenerationRequest): string | null {
  if (req.instruction.trim().length === 0) {
    return 'Diga o que precisa ser produzido.';
  }
  if (req.instruction.length > 4000) {
    return 'A instrução é longa demais (limite de 4000 caracteres).';
  }
  if (req.kind !== 'text' && req.kind !== 'image') {
    return 'Modalidade desconhecida.';
  }
  return null;
}

/**
 * ⭐ **O ENVELOPE DO FATO — e o que ele DELIBERADAMENTE não carrega.**
 *
 * O evento de geração vai para `core.event_outbox`, que é lida por consumidores
 * e vira trilha. O CORE-SPEC §4 é literal: *"a trilha nunca guarda segredo"*.
 *
 * ⛔ **O prompt NÃO entra no payload.** Ele carrega o contexto da marca do
 * tenant — quem somos, como falamos, o que nunca dizemos — e pode carregar o
 * briefing de um trabalho confidencial. Um fato que o correio entrega a
 * qualquer consumidor inscrito não é lugar para isso.
 *
 * O que entra: **quanto** foi consumido, **em que métrica**, a modalidade, o
 * tamanho do prompt (para diagnosticar custo sem lê-lo) e o resultado. É o
 * suficiente para faturar, auditar e investigar — e insuficiente para vazar.
 *
 * ⚠️ `adapterId` também fica de fora, e por outra razão: é o nome do
 * fornecedor. Ver a Lei do Motor em `types.ts`. Ele vai para o `usage_ledger`,
 * que é interno, e não para um envelope que a aplicação pode exibir.
 */
export function generationEventPayload(input: {
  readonly generationId: string;
  readonly kind: GenerationKind;
  readonly status: 'requested' | 'completed' | 'failed';
  readonly promptLength: number;
  readonly consumed?: number;
  readonly violations?: readonly string[];
  readonly failureReason?: string;
}): Readonly<Record<string, unknown>> {
  const base: Record<string, unknown> = {
    generationId: input.generationId,
    kind: input.kind,
    metric: AI_METRIC,
    promptLength: input.promptLength,
  };
  if (input.status === 'completed') {
    base.consumed = input.consumed ?? 0;
    base.violations = [...(input.violations ?? [])];
  }
  if (input.status === 'failed') {
    // A razão é a mensagem do adaptador, e ela pode conter o nome do
    // fornecedor num erro cru. Por isso a composição a normaliza antes; aqui o
    // campo existe e é curto de propósito.
    base.failureReason = (input.failureReason ?? 'desconhecida').slice(0, 200);
  }
  return base;
}

/**
 * ⭐ **O RASCUNHO DE MÁQUINA, marcado como tal.**
 *
 * O resultado da geração entra na esteira como **versão de entregável** — e o
 * humano decide. A marca não é decoração: sem ela, ninguém distingue o que a
 * máquina propôs do que uma pessoa entregou, e a revisão vira fé.
 *
 * ⚠️ Esta função devolve o TEXTO da instrução que fica na versão, e não a
 * versão inteira: quem grava é a composição, no schema do módulo. A forja não
 * conhece `ops.deliverables`.
 */
export function machineDraftInstruction(input: {
  readonly instruction: string;
  readonly violations: readonly string[];
}): string {
  const base = `Rascunho gerado pelo motor ALSHAM — ${input.instruction.trim()}`;
  if (input.violations.length === 0) return base;
  return `${base} ⚠️ contém termo(s) que a marca veta: ${input.violations.join(', ')}`;
}

export type { BrandContext };
