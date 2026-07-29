import type { GenerationKind } from '@alsham/ai';

/**
 * **OS ADAPTADORES DO MOTOR** — o único lugar do repositório onde um nome de
 * fornecedor de IA pode aparecer.
 *
 * ⚖️ **A LEI DO MOTOR, e a fronteira exata dela.**
 *
 * > O nome do fornecedor nunca aparece em **texto visível ao cliente**. O
 * > cliente vê o produto e o **motor ALSHAM**.
 *
 * A lei distingue duas coisas, e a distinção é o que torna este arquivo legal:
 *
 * | Permitido | Proibido |
 * |---|---|
 * | `import` de SDK, variável de ambiente, `model` no servidor | landing, hero, FAQ, badge, rótulo de UI, estado de carregamento, toast, estado vazio, resposta de API exposta ao cliente |
 *
 * Este arquivo é **código não-visível**: ele roda em `apps/api`, com a chave, e
 * o que devolve ao portal passa por `forge-service.ts`, que o traduz. O
 * `adapterId` sai daqui para o `usage_ledger` e para o log do servidor —
 * **nunca** para a resposta HTTP.
 *
 * ⭐ **Minerado do `lib/providers/image.ts` do kraken-v2** (PROVADO, com
 * assinante pagante), que resolveu exatamente este desenho: *"o fornecedor é
 * INVISÍVEL e trocável; cada motor é um `ImageEngine` registrado; o pipeline
 * chama sem saber qual é"*. A escolha vem de `env`, e é isso que sustenta o
 * bake-off: o mesmo pedido roda em motores diferentes só trocando o id, e cada
 * um loga o próprio custo.
 *
 * ⛔ **Nenhuma chave neste arquivo.** Todas vêm de `process.env`, e a ausência
 * de uma chave não é erro: é o estado `unconfigured`, que a tela diz em voz
 * alta.
 */

/** O que um adaptador devolve. Cru — quem traduz é o serviço. */
export interface AdapterOutput {
  readonly output: string;
  /** Quanto consumir da métrica de plano. Sempre ≥ 1. */
  readonly consumed: number;
}

/**
 * Um motor. `id` é o que vai para o livro-caixa de consumo (o custo por motor,
 * que é o bake-off do kraken) e para o log — nunca para a tela.
 */
export interface EngineAdapter {
  readonly id: string;
  readonly kind: GenerationKind;
  /** A variável de ambiente que liga este motor. Só o NOME, nunca o valor. */
  readonly keyEnv: string;
  /** Este ambiente tem a chave? */
  isConfigured(env: NodeJS.ProcessEnv): boolean;
  generate(prompt: string, env: NodeJS.ProcessEnv): Promise<AdapterOutput>;
}

/**
 * Uma variável presente **e não vazia**.
 *
 * ⚠️ Minerado do `lib/env.ts` do kraken, e a lição está escrita lá: *"lição do
 * v1 (bug do `?? ''`): string vazia é ERRO FATAL, nunca fallback silencioso"*.
 * Uma chave setada como string vazia num painel de deploy é o modo mais comum
 * de um ambiente parecer configurado e não estar.
 */
function temChave(env: NodeJS.ProcessEnv, nome: string): boolean {
  const v = env[nome];
  return typeof v === 'string' && v.trim().length > 0;
}

/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * **Motor de TEXTO.**
 *
 * O modelo vem de `ALSHAM_TEXT_MODEL` — configuração de engenharia, no
 * servidor. Não vive no banco do tenant: seria expor a composição do motor
 * (Lei do Motor) e dar ao cliente a chave de uma peça que ele nunca detém
 * (Lei 5 — *"o cliente usa; nunca detém o motor nem as chaves-mãe"*).
 */
const textEngine: EngineAdapter = {
  id: 'text-primary',
  kind: 'text',
  keyEnv: 'ALSHAM_TEXT_API_KEY',

  isConfigured(env) {
    return temChave(env, this.keyEnv);
  },

  async generate(prompt, env) {
    const key = env[this.keyEnv];
    if (typeof key !== 'string' || key.trim().length === 0) {
      // ⚠️ A mensagem cita o NOME da variável, nunca o valor — e o nome é
      // neutro de propósito: quem lê o log de produção não descobre o
      // fornecedor por causa dele.
      throw new Error(`${this.keyEnv} ausente: motor de texto inerte neste ambiente.`);
    }

    const model = env.ALSHAM_TEXT_MODEL;
    if (typeof model !== 'string' || model.trim().length === 0) {
      throw new Error('ALSHAM_TEXT_MODEL ausente: o motor não sabe o que executar.');
    }

    const resposta = await fetch(env.ALSHAM_TEXT_ENDPOINT ?? '', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!resposta.ok) {
      // ⚠️ O corpo do erro do fornecedor pode citar o nome dele. Aqui ele
      // ficaria no log do servidor — que é interno — mas `forge-service.ts`
      // NORMALIZA a mensagem antes de qualquer coisa sair na resposta HTTP.
      throw new Error(`motor de texto respondeu ${resposta.status}`);
    }

    const dados = (await resposta.json()) as {
      content?: { text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const texto = dados.content?.[0]?.text;
    if (typeof texto !== 'string' || texto.length === 0) {
      throw new Error('motor de texto não devolveu conteúdo');
    }

    // ⭐ A métrica de plano é **geração**, não token: o cliente entende
    // "quantas peças", e não "quantos tokens". O custo por token é assunto
    // interno, e vive no log do servidor.
    return { output: texto, consumed: 1 };
  },
};

/**
 * **Motor de ARTE.**
 *
 * ⭐ Padrão do `falGenerate()` do kraken-v2: endpoint síncrono, chave simples,
 * e **INERTE até a chave existir** — com erro claro, nunca com fallback
 * silencioso.
 *
 * ⚠️ O motor devolve **URL externa**. O kraken registrou a lição: *"o pipeline
 * BAIXA e re-hospeda (nunca persiste URL de terceiro)"* — porque URL de
 * provedor expira, e o entregável ficaria apontando para o nada.
 *
 * ⛔ **Aqui o re-hospedar NÃO acontece, e a ausência é declarada:** *Storage &
 * Arquivos* é capacidade do **Core** e está NÃO CONSTRUÍDA (Taxonomia §3). A
 * URL entra no entregável como `reference`, que é texto — e o
 * `MODULO-OPS-SPEC §3.4` já dizia que este módulo não guarda arquivo. Quando o
 * Storage existir, é aqui que o download entra.
 */
const imageEngine: EngineAdapter = {
  id: 'image-primary',
  kind: 'image',
  keyEnv: 'ALSHAM_IMAGE_API_KEY',

  isConfigured(env) {
    return temChave(env, this.keyEnv);
  },

  async generate(prompt, env) {
    const key = env[this.keyEnv];
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new Error(`${this.keyEnv} ausente: motor de arte inerte neste ambiente.`);
    }

    const endpoint = env.ALSHAM_IMAGE_ENDPOINT;
    if (typeof endpoint !== 'string' || endpoint.trim().length === 0) {
      throw new Error('ALSHAM_IMAGE_ENDPOINT ausente: o motor de arte não sabe para onde ir.');
    }

    const resposta = await fetch(endpoint, {
      method: 'POST',
      headers: { authorization: `Key ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.slice(0, 1500) }),
    });

    if (!resposta.ok) {
      throw new Error(`motor de arte respondeu ${resposta.status}`);
    }

    const dados = (await resposta.json()) as { images?: { url?: string }[] };
    const url = dados.images?.[0]?.url;
    if (typeof url !== 'string' || url.length === 0) {
      throw new Error('motor de arte não devolveu imagem');
    }

    return { output: url, consumed: 1 };
  },
};

/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * ⭐ **O MOCK — e ele SÓ existe no modo demonstração.**
 *
 * A regra dura da etapa: *"nunca mock fingindo ser IA em produção; o mock
 * existe só no modo demonstração, rotulado"*.
 *
 * Duas coisas garantem isso, e as duas são conferidas:
 *
 * 1. `createForgeService()` só o alcança quando `demoMode` é verdadeiro, e
 *    `demoMode` vem de `ALSHAM_FORGE_DEMO === 'true'` — nunca de "a chave está
 *    faltando, então vou de mock";
 * 2. o texto que ele devolve **diz que é demonstração**, na primeira linha. Um
 *    mock silencioso seria indistinguível de uma geração real numa
 *    apresentação, e é exatamente isso que não pode acontecer.
 */
const mockEngines: Record<GenerationKind, EngineAdapter> = {
  text: {
    id: 'demo-text',
    kind: 'text',
    keyEnv: '(nenhuma)',
    isConfigured: () => true,
    async generate(prompt) {
      const pedido = prompt.split('O que é preciso produzir:')[1]?.trim() ?? prompt.trim();
      return {
        output:
          `[DEMONSTRAÇÃO — texto de exemplo, não gerado pelo motor]\n\n` +
          `Rascunho para: ${pedido.slice(0, 180)}\n\n` +
          `Este ambiente está em modo demonstração. Nenhuma geração real ` +
          `aconteceu, e nenhum consumo foi cobrado do plano.`,
        consumed: 1,
      };
    },
  },
  image: {
    id: 'demo-image',
    kind: 'image',
    keyEnv: '(nenhuma)',
    isConfigured: () => true,
    async generate() {
      return {
        // Domínio inválido de propósito: uma referência de demonstração que
        // resolve para algum lugar real seria confundida com entrega.
        output: 'https://exemplo.invalido/demonstracao/arte-de-exemplo.png',
        consumed: 1,
      };
    },
  },
};

/* ══════════════════════════════════════════════════════════════════════════ */

/**
 * O adaptador de uma modalidade.
 *
 * ⭐ A escolha é **por modalidade**, não por nome de fornecedor — é o que
 * permite trocar o motor sem tocar em nenhuma outra linha do repositório, que é
 * o desenho do bake-off do kraken.
 */
export function adapterFor(kind: GenerationKind, demoMode: boolean): EngineAdapter {
  if (demoMode) return mockEngines[kind];
  return kind === 'text' ? textEngine : imageEngine;
}

/** Este ambiente tem chave para esta modalidade? */
export function hasKeyFor(
  kind: GenerationKind,
  env: NodeJS.ProcessEnv,
  demoMode: boolean,
): boolean {
  return adapterFor(kind, demoMode).isConfigured(env);
}

/**
 * ⛔ **A NORMALIZAÇÃO DA MENSAGEM DE ERRO — a última porta da Lei do Motor.**
 *
 * O erro cru de um fornecedor cita o nome dele: *"Ideogram 402: insufficient
 * balance"* é literalmente o que o kraken registrou em produção. Essa string
 * subiria pela pilha, entraria no `failure_reason`, iria para o payload do
 * evento e apareceria na tela.
 *
 * Esta função é o que impede. Ela devolve uma frase da casa, com o que o
 * operador precisa saber — e o erro cru fica no log do servidor, que é interno.
 */
export function safeFailureReason(erro: unknown): string {
  const cru = erro instanceof Error ? erro.message : String(erro);

  // Falta de saldo é o caso mais comum e o mais fácil de resolver — vale ter
  // frase própria. (No kraken foi o que parou a geração de imagem inteira, e
  // o dossiê registrou: *"402 é código de pagamento. Recarregar resolve."*)
  if (/\b(402|payment|balance|saldo|quota|exhaust)/i.test(cru)) {
    return 'O motor está sem saldo neste ambiente. Fale com quem administra a plataforma.';
  }
  if (/\b(401|403|unauthorized|forbidden|api[_ -]?key)/i.test(cru)) {
    return 'O motor recusou a credencial deste ambiente — ver o runbook da forja.';
  }
  if (/\b(429|rate)/i.test(cru)) {
    return 'O motor está recebendo pedidos demais agora. Tente de novo em instantes.';
  }
  if (/\b(5\d\d|timeout|network|fetch failed)/i.test(cru)) {
    return 'O motor não respondeu. Tente de novo; se persistir, fale com quem administra.';
  }
  return 'A geração não pôde ser concluída. Nada foi cobrado do seu plano.';
}
