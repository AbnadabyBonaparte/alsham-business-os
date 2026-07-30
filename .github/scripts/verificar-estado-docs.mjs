#!/usr/bin/env node
/**
 * GUARDA DE DEFASAGEM — documento que declara NÃO CONSTRUÍDO o que já existe.
 *
 * Por que existe: as Etapas 4, 5 e 6 construíram parser, telas, correio e
 * contabilidade de uso, e SEIS documentos continuaram dizendo que nada disso
 * existia — inclusive dois de leitura obrigatória no VERTEX. Um agente que
 * lesse o canon reconstruiria peça pronta, ou se recusaria a mexer no que já
 * estava lá.
 *
 * A Lei 7 proíbe afirmar o que não foi provado. A recíproca não estava
 * guardada: negar o que existe é a mesma mentira com o sinal trocado, e é a
 * mais fácil de cometer, porque não exige que ninguém escreva nada — basta
 * não apagar.
 *
 * Como funciona: cada peça abaixo tem um DETECTOR (o arquivo que prova que ela
 * existe) e um PADRÃO (a forma como um documento a declararia ausente). Se o
 * detector encontra a peça e o padrão encontra a declaração, o build falha.
 *
 * O que esta guarda NÃO faz: ela não sabe o que está faltando declarar. Ela
 * pega defasagem para o lado otimista-ao-contrário, que é o observado. Peça
 * nova entra aqui à mão, e é de propósito: lista curada morde, heurística
 * genérica vira ruído e depois vira exceção.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Vive em `.github/scripts/` — é encanamento de CI, não pasta nova no topo (CLAUDE.md §6). */
const RAIZ = fileURLToPath(new URL('../..', import.meta.url));

/** Marcadores de "não existe" que um documento usa. */
const AUSENTE = /N[ÃA]O\s+(CONSTRU[ÍI]D[OA]|INICIAD[OA]|EXISTE|H[ÁA])/i;

/**
 * Marcadores de "existe". Se um deles aparece ENTRE a peça e o "não", o "não"
 * é sobre outra coisa — e a linha está certa.
 *
 * Sem isto a guarda reprova a própria correção: "a contabilidade de uso foi
 * feita; preço segue NÃO CONSTRUÍDO" é uma frase verdadeira que casa nas duas
 * pontas. Foi o que aconteceu na primeira versão, em 4 linhas.
 */
const AFIRMATIVO = /✅|constru[íi]d|existe|feit[ao]|mora|vive|pronta/i;

/**
 * Distância máxima, em caracteres, entre a peça e o "não" para que o segundo
 * seja predicado do primeiro. Numa tabela `| peça | NÃO CONSTRUÍDO |` são
 * poucos caracteres; num parágrafo que muda de assunto, muitos.
 *
 * 80 é ponto de partida — **NÃO VERIFICADO** contra um corpus grande de docs.
 * Se um dia der falso negativo, o conserto é a peça entrar na lista, não a
 * janela crescer até a guarda parar de morder.
 */
const JANELA = 80;

export const PECAS = [
  {
    nome: 'Parser de OFX/CSV',
    detector: [
      'packages/finance-reconciliation/src/parsing/ofx.ts',
      'packages/finance-reconciliation/src/parsing/csv.ts',
    ],
    // Exige OFX ou CSV na linha. É isso — e só isso — que separa a linha
    // legítima do CAMT.053 (que segue não construído) da linha defasada.
    //
    // Uma versão anterior excluía qualquer linha que citasse CAMT, e por isso
    // deixava passar justamente a forma que existia no repo:
    // "| Parser de OFX / CSV / CAMT.053 | **NÃO CONSTRUÍDO** |".
    padrao: /(parser|leitor)\b(?=.*\b(OFX|CSV)\b)/i,
    onde: 'packages/finance-reconciliation/src/parsing/',
  },
  {
    nome: 'Telas do Módulo 1',
    detector: [
      'apps/portal/src/app/conciliacao/page.tsx',
      'apps/portal/src/app/aprovacoes/page.tsx',
    ],
    // Só a afirmação varredora. "Tela de consumo NÃO CONSTRUÍDA" é verdade e
    // precisa continuar podendo ser escrita.
    padrao: /qualquer\s+(ui|tela)/i,
    onde: 'apps/portal/src/app/',
  },
  {
    nome: 'Despachante da caixa de saída (o correio)',
    detector: ['packages/workflow/src/courier.ts'],
    // NÃO CONSTRUÍDO é falso. NÃO LIGADO é verdade, e o AUSENTE não o pega —
    // é a distinção que mais importa nesta linha inteira.
    //
    // O `job` + lookahead existe porque a primeira versão exigia a frase exata
    // "job que entrega" e deixou passar "o job do Core que entrega", que era a
    // forma no MODULO-RECON-SPEC §8.2.
    padrao: /(despachante|correio\s+do\s+core|job\b(?=.{0,30}entrega))/i,
    onde: 'packages/workflow/src/courier.ts',
  },
  {
    nome: 'Módulo 2 — Campanhas de Marketing',
    detector: [
      'packages/marketing/src/manifest.ts',
      'packages/marketing/src/spend-approval.ts',
      'supabase/migrations/0004_marketing.sql',
    ],
    // O pacote existia como README vazio desde a Etapa 0, declarado
    // NÃO INICIADO em três documentos. Construí-lo sem apagar essas linhas era
    // exatamente o defeito que esta guarda nasceu para pegar.
    //
    // As 12 capacidades que o módulo NÃO implementa (calendário, social media,
    // e-mail marketing…) seguem podendo ser declaradas ausentes: elas não
    // casam com este padrão, que exige o nome do pacote ou "Módulo 2".
    padrao: /(m[óo]dulo 2|packages\/marketing|@alsham\/marketing)/i,
    onde: 'packages/marketing/',
  },
  {
    nome: 'A composição do Core (apps/api)',
    detector: [
      'apps/api/src/composition.ts',
      'apps/api/src/outbox-store.ts',
      'supabase/migrations/0005_courier_cron.sql',
    ],
    // `apps/api` foi declarado NÃO INICIADO desde a Etapa 0, em três
    // documentos. Construí-lo sem apagar essas linhas seria a defasagem de
    // sempre — e desta vez com consequência operacional: quem lesse o canon
    // acharia que o correio ainda não tem onde rodar.
    padrao: /(apps\/api|@alsham\/api|a composi[çc][ãa]o do core)/i,
    onde: 'apps/api/',
  },
  {
    nome: 'Contabilidade de uso',
    detector: ['packages/billing/src/usage.ts'],
    // Preço, fatura e gateway seguem não construídos DE PROPÓSITO (Lei 7) —
    // por isso o padrão nunca é a palavra "billing" solta, que apareceria em
    // linhas corretas como "Fatura, cobrança, inadimplência: NÃO CONSTRUÍDO".
    //
    // "Cobrança (billing)" entra porque é a forma varredora: nega o pacote
    // inteiro, e o pacote existe. Era a linha do `apps/portal/README.md`.
    padrao: /(usage_ledger|contabilidade\s+de\s+uso|cobran[çc]a\s*\(billing\))/i,
    onde: 'packages/billing/src/usage.ts',
  },
  {
    nome: 'Módulo 3 — Contas a Pagar',
    detector: [
      'packages/accounts-payable/src/manifest.ts',
      'packages/accounts-payable/src/payable.ts',
      'supabase/migrations/0007_ap.sql',
    ],
    // A capacidade *Contas a pagar* aparecia como NÃO CONSTRUÍDA na Taxonomia,
    // no Roadmap e no CORE-SPEC desde a Etapa 0 — e "contas a pagar" é uma
    // expressão comum demais para virar padrão sozinha: ela aparece em linhas
    // corretas do Domain Financeiro que falam das outras 18 capacidades.
    //
    // Por isso o padrão exige o NOME DA PEÇA: o módulo, o pacote ou o schema.
    padrao: /(m[óo]dulo 3|packages\/accounts-payable|@alsham\/accounts-payable)/i,
    onde: 'packages/accounts-payable/',
  },
  {
    nome: 'O triângulo — o Módulo 1 consumindo o Módulo 3',
    detector: [
      'packages/finance-reconciliation/src/external-payable.ts',
      'supabase/migrations/0008_recon_ap_projection.sql',
    ],
    // ⭐ A defasagem MAIS provável desta etapa, e a mais cara.
    //
    // De Etapa 2 a Etapa 9, três documentos disseram — corretamente — que o
    // `recon` NÃO consumia nada, que `consumes` era vazio e que o consumidor
    // de título externo estava NÃO CONSTRUÍDO. Todas essas frases viraram
    // mentira na Etapa 10, e nenhuma delas dá erro ao continuar no papel:
    // basta não apagar.
    //
    // O padrão exige o nome do arquivo, da função de projeção ou a expressão
    // inteira — "consumidor" solto apareceria em linhas corretas sobre
    // consumidores que de fato não existem.
    padrao: /(external-payable|record_external_payable|0008_recon_ap_projection|tri[âa]ngulo\s+do\s+lego)/i,
    onde: 'packages/finance-reconciliation/src/external-payable.ts',
  },
  {
    nome: 'Instalador de módulo em runtime',
    detector: ['supabase/migrations/0006_install.sql'],
    // ⚠️ ESTA PEÇA ENTROU NA ETAPA 10, e a razão é uma defasagem real.
    //
    // O instalador foi construído na Etapa 9, e o README continuou listando
    // "sem instalador de módulo" entre o que NÃO existe. A guarda não pegou
    // porque ninguém a ensinou a peça — que é o limite dela, declarado no
    // cabeçalho: ela confere o que está na lista, e a lista é curada.
    //
    // Curar a lista é parte de entregar a peça.
    padrao: /(instalador\s+de\s+m[óo]dulo|install_module|0006_install)/i,
    onde: 'supabase/migrations/0006_install.sql',
  },
  {
    nome: 'A Store (vitrine de módulos)',
    detector: [
      'apps/portal/src/app/store/page.tsx',
      'packages/permissions/src/catalog.ts',
    ],
    // "Store" sozinho é palavra comum demais (`OutboxStore`, `store-port`), e
    // por isso o padrão exige a expressão inteira ou o caminho.
    padrao: /(a\s+store\b|vitrine\s+de\s+m[óo]dulos|apps\/portal\/src\/app\/store)/i,
    onde: 'apps/portal/src/app/store/',
  },
  {
    nome: 'Módulo 4 — Relacionamentos (CRM base)',
    detector: [
      'packages/crm/src/manifest.ts',
      'packages/crm/src/party.ts',
      'supabase/migrations/0009_crm.sql',
    ],
    // `packages/crm` era README vazio, declarado NÃO INICIADO em três
    // documentos desde a Etapa 0 — e "CRM" é palavra que aparece em linhas
    // corretas sobre as 11 capacidades que seguem não construídas. Por isso o
    // padrão exige o NOME DA PEÇA: o módulo, o pacote ou o schema.
    padrao: /(m[óo]dulo 4|packages\/crm|@alsham\/crm|relacionamentos \(crm)/i,
    onde: 'packages/crm/',
  },
  {
    nome: 'Módulo 5 — Contas a Receber',
    detector: [
      'packages/accounts-receivable/src/manifest.ts',
      'packages/accounts-receivable/src/receivable.ts',
      'supabase/migrations/0010_ar.sql',
    ],
    // "Contas a receber" aparece em linhas corretas do Domain financeiro que
    // falam das outras 18 capacidades, e `ar` é curto demais para ser padrão.
    // Por isso o padrão exige o NOME DA PEÇA.
    padrao: /(m[óo]dulo 5|packages\/accounts-receivable|@alsham\/accounts-receivable|0010_ar)/i,
    onde: 'packages/accounts-receivable/',
  },
  {
    nome: 'Módulo 6 — Compras (Pedidos)',
    detector: [
      'packages/purchase-orders/src/manifest.ts',
      'packages/purchase-orders/src/order.ts',
      'supabase/migrations/0017_po.sql',
    ],
    padrao: /(m[óo]dulo 6|packages\/purchase-orders|@alsham\/purchase-orders|0017_po|compras \(pedidos\))/i,
    onde: 'packages/purchase-orders/',
  },
  // ⚠️ **A CHAVE ACIMA FALTAVA, e a ausência era invisível.**
  //
  // O rebase da Etapa 13 juntou a entrada do Módulo 6 (que veio da main) com a
  // do Módulo 7 (minha) dentro do MESMO objeto literal. Em JavaScript isso não
  // é erro: a segunda chave simplesmente sobrescreve a primeira. O verificador
  // seguiu passando, verde, **conferindo seis peças e dizendo que conferiu
  // sete** — o Módulo 6 sumiu da lista de saída e ninguém leu a lista.
  //
  // É a forma mais silenciosa de guarda quebrada: ela não falha nem acusa.
  // Só deixa de olhar. Quem mexer aqui: conte as linhas ✅ da saída.
  {
    nome: 'Módulo 7 — Esteira de Produção',
    detector: [
      'packages/ops/src/manifest.ts',
      'packages/ops/src/order.ts',
      'supabase/migrations/0018_ops.sql',
    ],
    // ⚠️ "esteira" e "ordem de serviço" aparecem em linhas de prosa que falam
    // do conceito, e `ops` é curto demais para ser padrão sozinho. O padrão
    // exige o NOME DA PEÇA — mesma lição do Módulo 5.
    padrao: /(m[óo]dulo 7|packages\/ops\b|@alsham\/ops|0018_ops)/i,
    onde: 'packages/ops/',
  },
  // ⚠️ MISSÃO TRINA: cada módulo novo entra num OBJETO LITERAL PRÓPRIO — a
  // lição do rebase da Etapa 13 (duas peças na mesma chave: a segunda
  // sobrescreve a primeira em silêncio). Conte as linhas ✅ da saída.
  {
    nome: 'Módulo 8 — Estoque',
    detector: [
      'packages/inventory/src/manifest.ts',
      'packages/inventory/src/inventory.ts',
      'supabase/migrations/0023_inv.sql',
    ],
    // "estoque" solto aparece em prosa sobre a capacidade; o padrão exige o
    // NOME DA PEÇA — mesma lição dos Módulos 5, 6 e 7.
    padrao: /(m[óo]dulo 8|packages\/inventory|@alsham\/inventory|0023_inv)/i,
    onde: 'packages/inventory/',
  },
  {
    nome: 'Módulo 9 — Propostas',
    detector: [
      'packages/quotes/src/manifest.ts',
      'packages/quotes/src/quote.ts',
      'supabase/migrations/0024_quote.sql',
    ],
    padrao: /(m[óo]dulo 9|packages\/quotes|@alsham\/quotes|0024_quote)/i,
    onde: 'packages/quotes/',
  },
  {
    nome: 'Módulo 10 — Funil Comercial',
    detector: [
      'packages/deals/src/manifest.ts',
      'packages/deals/src/deal.ts',
      'supabase/migrations/0025_deal.sql',
    ],
    // "funil" e "pipeline" soltos aparecem em prosa legítima (a capacidade
    // Pipeline do Domain, o pipeline do ops). O padrão exige o NOME DA PEÇA.
    padrao: /(m[óo]dulo 10|packages\/deals|@alsham\/deals|0025_deal)/i,
    onde: 'packages/deals/',
  },
  {
    nome: 'Módulo 11 — Eventos',
    detector: [
      'packages/event-management/src/manifest.ts',
      'packages/event-management/src/event.ts',
      'supabase/migrations/0026_evt.sql',
    ],
    // "evento" é a palavra mais sobrecarregada do repositório (EventEnvelope,
    // event_outbox, o vertical). O padrão exige o NOME DA PEÇA.
    padrao: /(m[óo]dulo 11|packages\/event-management|@alsham\/event-management|0026_evt)/i,
    onde: 'packages/event-management/',
  },
  {
    nome: 'Módulo 12 — Régua de Cobrança',
    detector: [
      'packages/dunning/src/manifest.ts',
      'packages/dunning/src/dun-title.ts',
      'supabase/migrations/0027_dun.sql',
    ],
    // ⚠️ NUNCA a palavra "cobrança" solta: ela tem duas donas (a régua e o
    // billing), e o padrão do billing já usa "cobrança (billing)". O padrão
    // exige o NOME DA PEÇA.
    padrao: /(m[óo]dulo 12|packages\/dunning|@alsham\/dunning|0027_dun)/i,
    onde: 'packages/dunning/',
  },
  {
    nome: 'Módulo 13 — Contratos',
    detector: [
      'packages/contracts/src/manifest.ts',
      'packages/contracts/src/contract.ts',
      'supabase/migrations/0028_ctr.sql',
    ],
    // ⚠️ NUNCA a palavra "contrato" solta: ela é vocabulário do CORAÇÃO do
    // canon (o CONTRATO do Lego, contrato puro, contrato público). O padrão
    // exige o NOME DA PEÇA.
    padrao: /(m[óo]dulo 13|packages\/contracts|@alsham\/contracts|0028_ctr)/i,
    onde: 'packages/contracts/',
  },
  {
    nome: 'Módulo 14 — Fluxo de Caixa',
    detector: [
      'packages/cashflow/src/manifest.ts',
      'packages/cashflow/src/cashflow.ts',
      'supabase/migrations/0029_cash.sql',
    ],
    // ⚠️ NUNCA a palavra "caixa" solta: ela mora em "caixa de saída" (o
    // outbox do Core) e em "livro-caixa" do billing. O padrão exige o NOME
    // DA PEÇA.
    padrao: /(m[óo]dulo 14|packages\/cashflow|@alsham\/cashflow|0029_cash)/i,
    onde: 'packages/cashflow/',
  },
  {
    nome: 'Módulo 15 — Atendimento',
    detector: [
      'packages/care/src/manifest.ts',
      'packages/care/src/care.ts',
      'supabase/migrations/0030_care.sql',
    ],
    padrao: /(m[óo]dulo 15|packages\/care|@alsham\/care|0030_care)/i,
    onde: 'packages/care/',
  },
  {
    nome: 'Módulo 16 — Ocorrências',
    detector: [
      'packages/occurrences/src/manifest.ts',
      'packages/occurrences/src/occurrence.ts',
      'supabase/migrations/0031_occ.sql',
    ],
    padrao: /(m[óo]dulo 16|packages\/occurrences|@alsham\/occurrences|0031_occ)/i,
    onde: 'packages/occurrences/',
  },
  {
    nome: 'Menu filtrado por permissão',
    detector: ['packages/permissions/src/menu.ts'],
    // A dívida da Etapa 10 foi paga: os itens de menu não são mais escritos à
    // mão no layout, e três deles não são mais os únicos filtrados. Um
    // documento que ainda diga "os outros itens ainda NÃO são filtrados"
    // estaria negando o que existe.
    padrao: /(menu\s+filtrado|visibleMenu|packages\/permissions\/src\/menu)/i,
    onde: 'packages/permissions/src/menu.ts',
  },
  {
    nome: 'A Forja — IA Base do Core',
    detector: [
      'packages/ai/src/forge.ts',
      'apps/api/src/forge-service.ts',
      'supabase/migrations/0019_forge.sql',
    ],
    // ⚠️ "IA" sozinho é curto demais e aparece em prosa sobre capacidades da
    // Taxonomia que de fato não existem (RAG, agentes, embeddings). O padrão
    // exige o NOME DA PEÇA — mesma lição dos Módulos 5 e 7.
    padrao: /(a\s+forja|packages\/ai\/src\/forge|@alsham\/ai\b|0019_forge|forge-service)/i,
    onde: 'packages/ai/ + apps/api/src/forge-service.ts',
  },
  {
    nome: 'Painel Executivo (home do tenant)',
    detector: [
      'supabase/migrations/0021_tenant_panel.sql',
      'apps/portal/src/lib/data/panel-port.ts',
    ],
    // ⚠️ "painel" sozinho é a palavra que este repositório usa para o portal
    // inteiro, desde a Etapa 4. O padrão exige o nome próprio da peça ou o
    // arquivo.
    padrao: /(painel\s+executivo|0021_tenant_panel|tenant_courier_summary|panel-port)/i,
    onde: 'apps/portal/src/app/page.tsx',
  },
];

/**
 * Migrations que o dono aplicou: declará-las pendentes convida a editá-las.
 *
 * ⚠️ A lista cresce a cada apply informado pelo dono — `0001`–`0002` na Etapa
 * 10, `0001`–`0006` depois, e `0001`–`0008` na Etapa 11, quando o dono
 * informou ter aplicado o Módulo 3 e a porta de projeção em 28/07/2026. Uma
 * migration aplicada que o canon ainda chama de "arquivo, não aplicada" é um
 * convite a editá-la — e arquivo aplicado editado faz o próximo ambiente nascer
 * diferente da produção EM SILÊNCIO.
 *
 * ⚠️ **Na Etapa 15 a lista saltou de `0009` para `0014`.** O dono informou, em
 * 29/07/2026, ter aplicado `0010`–`0014` — as quatro entraram fora do rito e
 * foram reconciliadas no livro depois. Um documento que continuasse chamando
 * o `0010_ar.sql` de "arquivo, não aplicado" convidaria o próximo agente a
 * editá-lo, que é exatamente o que esta guarda existe para impedir.
 *
 * `0017` em diante NÃO entra: essas são, de fato, só arquivo. Aplicá-las é ato
 * do dono (runbook §11 a §15), e declará-las pendentes é a verdade.
 */
export const APLICADAS = {
  padrao: /(0001_core|0002_recon|0003_billing|0004_marketing|0005_courier_cron|0006_install|0007_ap|0008_recon_ap_projection|0009_crm|0010_ar|0011_recon_receivables|0012_recon_match_decided|0013_ar_apply_recon_match|0014_ap_apply_recon_match)/i,
  marcador: /n[ãa]o\s+aplicad|arquivo,\s*n[ãa]o\s+aplicad/i,
};

/**
 * ⭐ ESTA GUARDA MUDOU DE LADO NA ETAPA 9 — e a inversão é o registro.
 *
 * Na Etapa 8 ela proibia afirmar que o correio estava no ar, porque ele estava
 * construído e **não** agendado. Em 28/07/2026 o dono ligou: `apps/api` no ar,
 * `pg_cron` + `pg_net` habilitados, job de 1 em 1 minuto.
 *
 * Uma guarda que continuasse proibindo a verdade obrigaria os documentos a
 * mentir para ficar verdes — que é o pior destino possível para uma guarda.
 * Então ela virou o oposto: **agora é proibido dizer que o correio NÃO está no
 * ar**, porque essa é a afirmação que hoje é falsa.
 *
 * ⚠️ **NÃO VERIFICADO por este repositório.** Quem conferiu foi o dono, no
 * ambiente dele; nenhum agente daqui conecta a produção. O fato entra como ele
 * informou, datado, e é isso que a guarda protege.
 */
const NAO_LIGADO_PROIBIDO = {
  padrao: /correio/i,
  /**
   * As formas de negar que ele roda. Exige a construção afirmativa, pelo mesmo
   * motivo de sempre: a palavra solta aparece em hipótese e em história.
   */
  marcador:
    /\b(n[ãa]o\s+(est[áa]\s+)?(ligado|no ar|rodando|agendado)|ningu[ée]m\s+agendou|falta\s+ligar|lig[áa]vel,?\s+mas)/i,
  /**
   * O que salva a frase: estar contando a HISTÓRIA ("até a Etapa 8 não
   * estava"), ou falar de outra coisa que de fato não está ligada.
   */
  negado: /(at[ée] a etapa|antes de|hist[óo]ric|era |estava |passou a|deixou de|alarme)/i,
};

/** Seções que são a fonte de estado — renomeá-las quebra os ponteiros. */
const SECOES = [
  { arquivo: 'docs/canon/CORE-SPEC.md', titulo: '## 5. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-RECON-SPEC.md', titulo: '## 7. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-MARKETING-SPEC.md', titulo: '## 6. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-AP-SPEC.md', titulo: '## 6. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-CRM-SPEC.md', titulo: '## 6. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-AR-SPEC.md', titulo: '## 5. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-PO-SPEC.md', titulo: '## 4. ESTADO DA CONSTRUÇÃO' },
  // ⚠️ A entrada do OPS FALTAVA aqui desde a Etapa 13 — o CLAUDE.md §5.6 o
  // cita como fonte de estado e o CI não conferia a seção. Regularizada na
  // Missão Trina, junto com as cinco specs novas.
  { arquivo: 'docs/canon/MODULO-OPS-SPEC.md', titulo: '## 5. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-INV-SPEC.md', titulo: '## 7. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-QUOTE-SPEC.md', titulo: '## 6. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-DEAL-SPEC.md', titulo: '## 6. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-EVT-SPEC.md', titulo: '## 6. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-DUN-SPEC.md', titulo: '## 7. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-CTR-SPEC.md', titulo: '## 6. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-CASH-SPEC.md', titulo: '## 6. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-CARE-SPEC.md', titulo: '## 6. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-OCC-SPEC.md', titulo: '## 6. ESTADO DA OBRA' },
];

/**
 * A linha declara a peça ausente?
 *
 * Exige que o "não" venha DEPOIS da peça, perto, e sem nenhuma afirmação de
 * existência no meio. Ordem importa: "preço NÃO CONSTRUÍDO — `usage_ledger`
 * conta uso" cita a peça depois do "não", e é uma linha correta.
 */
export function declaraAusente(linha, padrao) {
  const peca = padrao.exec(linha);
  if (!peca) return false;
  const depois = linha.slice(peca.index + peca[0].length);
  const ausente = AUSENTE.exec(depois);
  if (!ausente || ausente.index > JANELA) return false;
  return !AFIRMATIVO.test(depois.slice(0, ausente.index));
}

function markdowns(dir, saida = []) {
  for (const nome of readdirSync(dir)) {
    if (nome === 'node_modules' || nome === '.git' || nome === '.next') continue;
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) markdowns(caminho, saida);
    else if (nome.endsWith('.md')) saida.push(caminho);
  }
  return saida;
}

/** Só varre o repositório quando chamado como script; o teste importa e não executa. */
if (process.argv[1] && process.argv[1].endsWith('verificar-estado-docs.mjs')) varrer();

function varrer() {
const falhas = [];
const arquivos = markdowns(RAIZ);

for (const peca of PECAS) {
  const construida = peca.detector.every((p) => existsSync(join(RAIZ, p)));
  if (!construida) {
    console.log(`⏭  ${peca.nome} — ainda não construída, nada a conferir`);
    continue;
  }
  let achados = 0;
  for (const arquivo of arquivos) {
    const linhas = readFileSync(arquivo, 'utf8').split('\n');
    linhas.forEach((linha, i) => {
      if (declaraAusente(linha, peca.padrao)) {
        falhas.push(
          `${relative(RAIZ, arquivo)}:${i + 1} declara "${peca.nome}" ausente, ` +
            `mas existe em ${peca.onde}\n      → ${linha.trim()}`,
        );
        achados++;
      }
    });
  }
  console.log(`${achados ? '❌' : '✅'} ${peca.nome} — construída, ${achados} declaração(ões) defasada(s)`);
}

let migracoes = 0;
for (const arquivo of arquivos) {
  const linhas = readFileSync(arquivo, 'utf8').split('\n');
  linhas.forEach((linha, i) => {
    if (APLICADAS.padrao.test(linha) && APLICADAS.marcador.test(linha)) {
      falhas.push(
        `${relative(RAIZ, arquivo)}:${i + 1} diz que 0001/0002 não foram aplicadas — ` +
          `elas foram, e declará-las pendentes convida a editar migration aplicada\n      → ${linha.trim()}`,
      );
      migracoes++;
    }
  });
}
console.log(`${migracoes ? '❌' : '✅'} Migrations aplicadas — ${migracoes} declaração(ões) defasada(s)`);

let noAr = 0;
for (const arquivo of arquivos) {
  const linhas = readFileSync(arquivo, 'utf8').split('\n');
  linhas.forEach((linha, i) => {
    if (
      NAO_LIGADO_PROIBIDO.padrao.test(linha) &&
      NAO_LIGADO_PROIBIDO.marcador.test(linha) &&
      !NAO_LIGADO_PROIBIDO.negado.test(linha)
    ) {
      falhas.push(
        `${relative(RAIZ, arquivo)}:${i + 1} diz que o correio NÃO está no ar — ele foi ligado pelo dono ` +
          `em 28/07/2026 (runbook §6)\n      → ${linha.trim()}`,
      );
      noAr++;
    }
  });
}
console.log(`${noAr ? '❌' : '✅'} O correio não é dado como desligado — ${noAr} afirmação(ões) defasada(s)`);

for (const secao of SECOES) {
  const caminho = join(RAIZ, secao.arquivo);
  const ok = existsSync(caminho) && readFileSync(caminho, 'utf8').includes(secao.titulo);
  if (!ok) falhas.push(`${secao.arquivo} perdeu a seção "${secao.titulo}" — é a fonte de estado citada pelo README`);
  console.log(`${ok ? '✅' : '❌'} Seção de estado em ${secao.arquivo}`);
}

if (falhas.length) {
  console.error(`\n❌ ${falhas.length} documento(s) declarando ausente o que já existe:\n`);
  for (const f of falhas) console.error(`   • ${f}`);
  console.error(
    '\nNegar o que existe é a Lei 7 com o sinal trocado. Atualize a linha —\n' +
      'e se a peça realmente sumiu, apague a peça, não a guarda.\n',
  );
  process.exit(1);
}

console.log(`\n✅ ${arquivos.length} documentos conferidos: nenhum declara ausente o que já existe.`);
}
