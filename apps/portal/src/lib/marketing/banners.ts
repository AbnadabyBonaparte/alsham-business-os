/**
 * ⭐ **OS BANNERS CONTEXTUAIS — a voz de marca DENTRO do produto.**
 *
 * A régua é o `docs/POSICIONAMENTO-DE-VOZ-E-MARCA.md`: prova, não promessa;
 * presença, não drama. Cada linha aqui só existe porque a tela onde ela aparece
 * **já faz aquilo de verdade** — nenhuma promete capacidade que não existe
 * (Lei 7). As frases das telas-módulo são as MESMAS já canonizadas na tabela §4
 * da lei de voz; as de confiança e eficiência saem de fatos reais do produto.
 *
 * ⚖️ **Lei do Motor:** o motor é ALSHAM. Nenhuma linha cita fornecedor de IA de
 * terceiros — e a banca (`banners.test.ts`) reprova quem tentar, junto do
 * superlativo de "agent-washing" que a própria lei de voz manda evitar.
 *
 * ⛔ **Só a FRASE é dado de runtime.** Este módulo é importado por um client
 * component, então tudo que for valor aqui vai ao bundle do navegador E ao scan
 * de tela do CI. Por isso `PAGE_BANNERS` carrega só o texto visível; a ÂNCORA
 * de cada frase (de onde no produto ela é verdadeira) fica em COMENTÁRIO — o
 * empacotador descarta comentário, então a prova de origem não vira, ela mesma,
 * peso morto no cliente nem referência interna vazada. A banca confere a lista.
 */

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
 * ⭐ O MAPA — 2 a 3 frases por chave, para a rotação silenciosa.
 *
 * As frases das telas-módulo são transcritas da §4 da lei de voz (a tabela de
 * exemplos já escritos nesse padrão). As de confiança/eficiência seguem a mesma
 * fórmula "o sistema faz X; o humano faz Y", sobre fatos que o produto cumpre.
 */
export const PAGE_BANNERS: Record<BannerKey, readonly string[]> = {
  painel: [
    // Painel Executivo (0021): cada cartão vem de count() do banco ou de
    // core.plan_limits — nenhum número ilustrativo (Lei 7).
    'Nenhum número nesta tela é ilustrativo. Cada um sai de uma contagem real ou de uma linha do plano.',
    // Avisos proativos (o observador determinístico sobre dado real).
    'O sistema aponta o que pede atenção; a decisão continua sendo de quem opera.',
    // O Painel degrada por partes e nunca inventa "OK" (page.tsx).
    'Quando a leitura falha, a tela diz que falhou. Um veredito falso é pior do que veredito nenhum.',
  ],
  conciliacao: [
    // Frase canônica da Conciliação — lei de voz §3 e §4.
    'O sistema sugere; o humano visa.',
    // Motor de sugestão do Módulo 1: propõe a baixa; o humano aprova cada linha.
    'A mesa propõe a baixa a partir do extrato. Confirmar cada linha é ato de gente.',
  ],
  esteira: [
    // Frase canônica da Esteira — lei de voz §4; pular etapa é ato registrado.
    'O trabalho anda à vista. Ninguém pula etapa sem que alguém decida pular.',
    // Módulo 7 (ops): a Lei das Etapas — etapas são dado do tenant, não enum.
    'As etapas são o desenho da sua empresa, não um molde nosso.',
  ],
  cobranca: [
    // Frase canônica da Régua de Cobrança — lei de voz §4; a régua não liga sozinha.
    'O sistema lembra no dia certo; a ligação difícil continua sendo sua.',
    // Módulo 12: a baixa na origem tira o título da régua sem passo manual.
    'A régua é o seu desenho, e a baixa na origem tira o título dela sozinha.',
  ],
  checklists: [
    // Frase canônica dos Checklists — lei de voz §4; concluir exige tudo respondido.
    'A prancheta não esquece um item. Mas quem confere com os próprios olhos é você.',
    // Módulo 19: executar congela o modelo por cópia; resposta dada não se rasura.
    'Executar congela o modelo por cópia. O redesenho de amanhã não reescreve a inspeção de hoje.',
  ],
  manutencao: [
    // Frase canônica da Manutenção — lei de voz §4; próxima devida calculada, sem cron.
    'O sistema sabe quando a próxima preventiva vence. Decidir se ela espera é decisão de gente.',
    // Módulo 17: gerar ordem por relógio é futuro declarado — o sistema não finge.
    'A rotina calcula a próxima ordem devida; gerar por relógio sozinho é o que o sistema não finge fazer.',
  ],
  confianca: [
    // Isolamento por empresa: a cerca é a RLS do banco + tenant_id em toda
    // query, resolvido no servidor (o mapa de segurança de tenant do canon).
    'O dado de cada empresa vive isolado. Toda consulta carrega o tenant, e a cerca é do banco, não da tela.',
    // Trilha imutável em toda a plataforma: fato consumado não se reescreve.
    'Nada aqui se edita nem se apaga. Corrigir é registrar outra linha — a trilha é permanente.',
    // A chave de serviço/motor vive só no servidor que compõe; há guarda de CI
    // sobre o bundle de cliente. (Sem o literal do token aqui — ele viraria a
    // própria infração que a guarda existe para impedir.)
    'A chave do motor nunca chega ao navegador. Ela vive só no servidor que compõe.',
  ],
  eficiencia: [
    // A fórmula da lei de voz §4 — o padrão de toda tela nova.
    'O sistema faz a parte de memória e vigilância que ninguém quer fazer à mão. O julgamento fica com você.',
    // Lei 7 + lei de voz §5: ancorar em número verificável, nunca em adjetivo.
    'Prova, não promessa: o que a tela mostra, ela mostra a partir do que aconteceu de verdade.',
    // O modelo de catálogo/Store (Lei do Lego): módulos entram e saem.
    'A empresa não compra um sistema. Ela monta o dela — Core mais módulos, como Lego.',
  ],
};

/**
 * Todas as chaves de banner conhecidas, ordenadas — para a tela e o teste.
 */
export function bannerKeys(): BannerKey[] {
  return (Object.keys(PAGE_BANNERS) as BannerKey[]).sort();
}
