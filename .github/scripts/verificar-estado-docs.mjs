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

/** Vive em `.github/scripts/` — é encanamento de CI, não pasta nova no topo (CLAUDE.md §6). */
const RAIZ = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');

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
];

/** Migrations que o dono aplicou: declará-las pendentes convida a editá-las. */
export const APLICADAS = {
  padrao: /(0001_core|0002_recon)/i,
  marcador: /n[ãa]o\s+aplicad|arquivo,\s*n[ãa]o\s+aplicad/i,
};

/** Seções que são a fonte de estado — renomeá-las quebra os ponteiros. */
const SECOES = [
  { arquivo: 'docs/canon/CORE-SPEC.md', titulo: '## 5. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-RECON-SPEC.md', titulo: '## 7. ESTADO DA OBRA' },
  { arquivo: 'docs/canon/MODULO-MARKETING-SPEC.md', titulo: '## 6. ESTADO DA OBRA' },
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
