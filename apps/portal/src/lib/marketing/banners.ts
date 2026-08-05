/**
 * ⭐ **OS BANNERS CONTEXTUAIS — a voz de marca DENTRO do produto.**
 *
 * A régua é o `docs/POSICIONAMENTO-DE-VOZ-E-MARCA.md`: prova, não promessa;
 * presença, não drama. Cada linha aqui só existe porque a tela onde ela aparece
 * **já faz aquilo de verdade** — nenhuma promete capacidade que não existe
 * (Lei 7). As frases das telas-módulo são as MESMAS já canonizadas na tabela §4
 * da lei de voz; as de confiança e eficiência saem de fatos reais do canon
 * (RLS + `tenant_id`, trilha imutável, número contado no banco, chave de motor
 * fora do navegador).
 *
 * ⚖️ **Lei do Motor:** o motor é ALSHAM. Nenhuma linha cita fornecedor de IA de
 * terceiros — e o `findHype()` abaixo reprova quem tentar, junto do superlativo
 * de "agent-washing" que a própria lei de voz manda evitar.
 *
 * ⛔ **Zero I/O, framework-free.** Este é um mapa de dados puro + uma guarda de
 * texto. A PELE que roda a rotação é o `<ContextBanner>`; o dado honesto é aqui.
 */

/** Uma variação de banner — a linha visível e a âncora que a torna verdadeira. */
export interface BannerFact {
  /** A frase institucional que aparece na tela. Curta, sóbria, sem emoji. */
  readonly text: string;
  /**
   * O fato REAL que ancora a frase — de onde no produto/canon ela é verdadeira.
   * Não vai à tela: é a prova para quem revisa (e o alvo do teste anti-hype).
   */
  readonly grounds: string;
}

/**
 * As chaves de banner. As de módulo casam com a rota; `confianca` e
 * `eficiencia` são transversais (rodam na home e onde mais fizer sentido).
 */
export type BannerKey =
  | 'painel'
  | 'conciliacao'
  | 'esteira'
  | 'cobranca'
  | 'checklists'
  | 'manutencao'
  | 'confianca'
  | 'eficiencia';

/**
 * ⭐ O MAPA — 2 a 3 variações por chave, para a rotação silenciosa.
 *
 * As frases das telas-módulo são transcritas da §4 da lei de voz (a tabela de
 * exemplos já escritos nesse padrão). As de confiança/eficiência foram
 * derivadas de fatos que o produto realmente cumpre, no mesmo molde da fórmula
 * "o sistema faz X; o humano faz Y".
 */
export const PAGE_BANNERS: Record<BannerKey, readonly BannerFact[]> = {
  painel: [
    {
      text: 'Nenhum número nesta tela é ilustrativo. Cada um sai de uma contagem real ou de uma linha do plano.',
      grounds: 'Painel Executivo (0021): cada cartão vem de count() do banco ou de core.plan_limits (Lei 7).',
    },
    {
      text: 'O sistema aponta o que pede atenção; a decisão continua sendo de quem opera.',
      grounds: 'Avisos proativos (core.tenant_insights, 0116): observador determinístico sobre dado real.',
    },
    {
      text: 'Quando a leitura falha, a tela diz que falhou. Um veredito falso é pior do que veredito nenhum.',
      grounds: 'Painel degrada por partes (Promise.allSettled); nunca inventa "OK" — page.tsx.',
    },
  ],
  conciliacao: [
    {
      text: 'O sistema sugere; o humano visa.',
      grounds: 'Frase canônica da Conciliação — POSICIONAMENTO-DE-VOZ-E-MARCA §3 e §4.',
    },
    {
      text: 'A mesa propõe a baixa a partir do extrato. Confirmar cada linha é ato de gente.',
      grounds: 'Motor de sugestão do Módulo 1 (finance-reconciliation): suggestMatches, humano aprova.',
    },
  ],
  esteira: [
    {
      text: 'O trabalho anda à vista. Ninguém pula etapa sem que alguém decida pular.',
      grounds: 'Frase canônica da Esteira de Produção — lei de voz §4; ops: pular é ato registrado.',
    },
    {
      text: 'As etapas são o desenho da sua empresa, não um molde nosso.',
      grounds: 'Módulo 7 (ops): a Lei das Etapas — etapas são dado do tenant, nunca enum do produto.',
    },
  ],
  cobranca: [
    {
      text: 'O sistema lembra no dia certo; a ligação difícil continua sendo sua.',
      grounds: 'Frase canônica da Régua de Cobrança — lei de voz §4; dun não envia nada sozinho.',
    },
    {
      text: 'A régua é o seu desenho, e a baixa na origem tira o título dela sozinha.',
      grounds: 'Módulo 12 (dun): projeta ar.receivable.*; baixa remove da régua — sem passo manual.',
    },
  ],
  checklists: [
    {
      text: 'A prancheta não esquece um item. Mas quem confere com os próprios olhos é você.',
      grounds: 'Frase canônica dos Checklists — lei de voz §4; chk: concluir exige tudo respondido.',
    },
    {
      text: 'Executar congela o modelo por cópia. O redesenho de amanhã não reescreve a inspeção de hoje.',
      grounds: 'Módulo 19 (chk): o gatilho copia o modelo na abertura; resposta dada não se rasura.',
    },
  ],
  manutencao: [
    {
      text: 'O sistema sabe quando a próxima preventiva vence. Decidir se ela espera é decisão de gente.',
      grounds: 'Frase canônica da Manutenção — lei de voz §4; mnt: próxima devida calculada, sem cron.',
    },
    {
      text: 'A rotina calcula a próxima ordem devida; gerar por relógio sozinho é o que o sistema não finge fazer.',
      grounds: 'Módulo 17 (mnt): recorrência do tenant, próxima devida calculada — gerar por cron é futuro declarado.',
    },
  ],
  confianca: [
    {
      text: 'O dado de cada empresa vive isolado. Toda consulta carrega o tenant, e a cerca é do banco, não da tela.',
      grounds: 'RLS ligada + tenant_id em toda query (CLAUDE.md §3, §5.4); resolvido no servidor via core.memberships.',
    },
    {
      text: 'Nada aqui se edita nem se apaga. Corrigir é registrar outra linha — a trilha é permanente.',
      grounds: 'Trilha imutável em toda a plataforma (interações crm, ledger, occ, etc.): fato consumado não se reescreve.',
    },
    {
      text: 'A chave do motor nunca chega ao navegador. Ela vive só no servidor que compõe.',
      grounds: 'service_role e chave de motor só no apps/api; guarda de CI sobre o bundle de cliente (§5.4).',
    },
  ],
  eficiencia: [
    {
      text: 'O sistema faz a parte de memória e vigilância que ninguém quer fazer à mão. O julgamento fica com você.',
      grounds: 'A fórmula da lei de voz §4 — o padrão de toda tela nova.',
    },
    {
      text: 'Prova, não promessa: o que a tela mostra, ela mostra a partir do que aconteceu de verdade.',
      grounds: 'Lei 7 + lei de voz §5: ancorar em número verificável, nunca em adjetivo.',
    },
    {
      text: 'A empresa não compra um sistema. Ela monta o dela — Core mais módulos, como Lego.',
      grounds: 'Modelo de catálogo/Store (CLAUDE.md §5.5, Lei do Lego): módulos entram e saem.',
    },
  ],
};

/**
 * ⛔ **A GUARDA ANTI-HYPE — a lei de voz virada verificação.**
 *
 * Reprova (1) o superlativo de "agent-washing" que a §5 manda evitar, (2) o
 * drama de ficção científica da §3, e (3) qualquer nome de fornecedor de IA de
 * terceiros (Lei do Motor). Cru, minúsculo, por substring — o suficiente para
 * uma frase de marketing não escorregar para a bandeira vermelha do comprador
 * de 2026.
 */
const HYPE_TERMS: readonly string[] = [
  // Superlativo vazio / promessa inflada (lei de voz §5).
  'revolucion',
  'o futuro chegou',
  'superinteligência',
  'superinteligencia',
  'poderosa',
  'poderoso',
  'mágica',
  'magica',
  'incrível',
  'incrivel',
  'disruptiv',
  'de ponta',
  'inigualável',
  'inigualavel',
  'o melhor do mercado',
  'líder de mercado',
  'lider de mercado',
  'game changer',
  'game-changer',
  // Fornecedor de IA de terceiros (Lei do Motor — kraken/alsham CLAUDE.md).
  'claude',
  'anthropic',
  'gpt',
  'openai',
  'gemini',
  'llama',
  'mistral',
  'deepseek',
  'chatgpt',
];

/** Faixa de emoji comum — o produto não usa emoji (IDENTIDADE-VISUAL §6). */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/u;

/**
 * Devolve os termos proibidos encontrados em `text` (vazio = limpo). O teste
 * roda isto sobre TODA frase do mapa; a lista precisa sair vazia.
 */
export function findHype(text: string): string[] {
  const lower = text.toLowerCase();
  const hits = HYPE_TERMS.filter((t) => lower.includes(t));
  if (EMOJI.test(text)) hits.push('<emoji>');
  return hits;
}

/**
 * Todas as chaves de banner conhecidas, ordenadas — para a tela e o teste.
 */
export function bannerKeys(): BannerKey[] {
  return (Object.keys(PAGE_BANNERS) as BannerKey[]).sort();
}
