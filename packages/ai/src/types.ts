/**
 * Os tipos da **IA Base** — capacidade do **Core** (Taxonomia §3), não módulo.
 *
 * ⭐ **A forja é do Core, e por isso não aparece na Store.** Ela é encanamento:
 * qualquer módulo pede geração ao Core, e o Core executa. Fazer dela um módulo
 * obrigaria cada consumidor a instalá-la — e obrigaria o Módulo 7 a conhecer o
 * Módulo de IA, que é exatamente o que a Lei do Lego proíbe.
 *
 * ---
 *
 * ## ⚖️ A LEI DO MOTOR, e ela governa este pacote inteiro
 *
 * > **O motor é receita interna.** O nome do fornecedor de IA nunca aparece em
 * > texto visível ao cliente. O cliente vê o produto e o **motor ALSHAM**.
 *
 * É lei do império (`CLAUDE.md` da ALSHAM Global e do kraken), e o kraken-v2 já
 * a implementou em código — `lib/providerLabels.ts` devolve o rótulo
 * **funcional** da etapa ("Texto", "Arte"), nunca o nome do provedor.
 *
 * Aqui ela vira estrutura: o tipo que a tela recebe (`EngineLabel`) **não tem
 * campo para o nome do fornecedor**. Não é uma regra que alguém tem de lembrar
 * na revisão — é um campo que não existe.
 *
 * O `adapterId` existe e é interno: ele vai para o `usage_ledger` (para saber o
 * custo por motor, que é o bake-off do kraken) e para o log do servidor. Nunca
 * para a resposta que o portal renderiza.
 *
 * @see docs/canon/CORE-SPEC.md — a IA Base é Core, Fase 1
 * @see supabase/migrations/0019_forge.sql — o schema que sustenta estes tipos
 */

/** O que se pede à forja. Duas modalidades, e só as duas estão construídas. */
export type GenerationKind = 'text' | 'image';

/**
 * O estado de uma modalidade **neste ambiente**.
 *
 * ⭐ **É o tipo que torna a honestidade obrigatória.** A tela não pode
 * renderizar um botão de gerar sem antes olhar para isto — e cada estado tem
 * uma frase própria, porque "não deu" não ajuda ninguém a resolver.
 */
export type EngineState =
  /** Chave presente e métrica configurada: gera de verdade. */
  | { readonly status: 'ready' }
  /**
   * **Sem chave neste ambiente.** Não é erro nem bug: é ambiente não
   * configurado, e a tela diz isso com o ponteiro para o runbook.
   */
  | { readonly status: 'unconfigured'; readonly runbookSection: string }
  /**
   * ⛔ **Sem medição, sem geração.** O plano do tenant não declara teto para a
   * métrica de geração — e `checkLimit()` nega por omissão. Gerar sem poder
   * medir é consumo que ninguém cobra e ninguém vê.
   */
  | { readonly status: 'unmetered'; readonly metric: string }
  /** O tenant estourou o teto do plano e o plano corta. */
  | { readonly status: 'exhausted'; readonly metric: string; readonly limit: number; readonly used: number }
  /**
   * **Modo demonstração, ROTULADO.** O mock existe só aqui, e a tela é
   * obrigada a dizê-lo — mock que se passa por IA em produção é a mentira mais
   * cara que este produto poderia contar.
   */
  | { readonly status: 'demo' };

/**
 * O rótulo que a tela mostra.
 *
 * ⚖️ **Repare no que este tipo NÃO tem: o nome do fornecedor.** Ver a Lei do
 * Motor no cabeçalho. O que o cliente lê é a ETAPA — "Texto", "Arte" — e o
 * motor ALSHAM.
 */
export interface EngineLabel {
  /** O que a geração faz, na língua do cliente. */
  readonly step: 'Texto' | 'Arte';
  /** Sempre o motor da casa. */
  readonly engine: 'motor ALSHAM';
}

/**
 * O **Cérebro da Marca** do tenant — a semente do que o kraken-v2 chama de
 * `personas.voice_profile` + `forbidden_terms` + `value_vetoes`.
 *
 * ⭐ **É DADO DO TENANT, nunca constante do produto.** Cada empresa fala de um
 * jeito, e o produto que escolhe o tom escolhe a marca do cliente por ele.
 *
 * ⚠️ Aqui é UM registro por tenant, e não uma tabela de personas como no
 * kraken. A divergência é deliberada: persona por linha só faz sentido quando o
 * produto é conteúdo e o cliente tem várias marcas. Numa plataforma de gestão,
 * o tenant **é** a marca. Quando um tenant precisar de duas vozes, isso nasce
 * como capacidade própria — com a razão escrita, como manda a casa.
 */
export interface BrandContext {
  /** Quem somos. Texto livre. */
  readonly identity: string;
  /** Como falamos. Texto livre. */
  readonly tone: string;
  /**
   * ⛔ O que **nunca** se diz. Um termo por linha.
   *
   * Minerado dos `forbidden_terms` do kraken, e com a mesma arquitetura de
   * duas camadas: a lista entra na instrução E o resultado é conferido contra
   * ela depois. Restrição em prompt é pedido; a conferência é garantia.
   */
  readonly forbidden: readonly string[];
}

/** O pedido de geração, já montado. */
export interface GenerationRequest {
  readonly kind: GenerationKind;
  /** O que o operador pediu. */
  readonly instruction: string;
  /** O contexto do trabalho — título e descrição da OS, por exemplo. */
  readonly workContext: string;
  readonly brand: BrandContext;
}

/** O que a forja devolve quando dá certo. */
export interface GenerationResult {
  readonly kind: GenerationKind;
  /** O texto gerado, ou a referência da imagem re-hospedada. */
  readonly output: string;
  /**
   * O que foi consumido, na unidade da métrica de plano.
   *
   * ⭐ **Sempre ≥ 1.** Uma geração que não consome nada é uma geração que não
   * aparece no livro-caixa — e o teto do plano deixa de existir na prática.
   */
  readonly consumed: number;
  /**
   * O adaptador que executou. **INTERNO**: vai para o `usage_ledger` e para o
   * log do servidor, nunca para a tela. Ver a Lei do Motor.
   */
  readonly adapterId: string;
  /**
   * Termos proibidos que ESCAPARAM, detectados pela rede de segurança.
   *
   * Minerado do `findViolations()` do kraken: o detector **não redige**, ele
   * acusa. Peça com termo proibido nasce como rascunho com aviso — nunca
   * publica com buraco, e nunca some sem o operador saber por quê.
   */
  readonly violations: readonly string[];
}

/** O estado de um pedido de geração, espelhando `core.ai_generations`. */
export type GenerationStatus = 'requested' | 'completed' | 'failed';
