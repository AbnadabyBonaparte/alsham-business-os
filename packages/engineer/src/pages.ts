import { ALL_MENU_ITEMS } from '@alsham/permissions';

/**
 * **O CATÁLOGO DE PÁGINAS — a consciência de LOCALIZAÇÃO do Engenheiro.**
 *
 * Importado do PERITUS (`src/lib/ia/paginas.ts`): sem isto, "essa tela faz o
 * quê?" só recebe resposta genérica, porque a rota atual nunca chega ao contexto
 * do motor.
 *
 * ⭐ **Sol Único: a lista DERIVA do menu, nunca uma segunda lista.** `rota` e
 * `nome` vêm de `ALL_MENU_ITEMS` (`@alsham/permissions`) — a mesma fonte que o
 * layout desenha. Uma segunda tabela de rotas desalinharia no dia em que um
 * módulo mudasse de rótulo e só um dos dois lugares fosse corrigido.
 *
 * ⚠️ **`descricao`/`comoUsar` nascem VAZIOS e se preenchem aos poucos (Lei 7).**
 * O MVP cura só as páginas que ganham motor local (o Painel e a Agenda) e as
 * sigilosas (para o modelo saber o que são sem revelar valor). As demais páginas
 * têm consciência de rota e nome — nunca um texto genérico inventado para
 * "preencher o buraco".
 *
 * Módulo PURO: importado pelo servidor (a rota) E pelo navegador (a Presença).
 * Nada de banco, sessão ou credencial aqui.
 */

export interface EnginePage {
  /** Rota do App Router. `[id]` marca segmento dinâmico de detalhe. */
  readonly rota: string;
  /** Nome institucional da tela (o rótulo do menu). */
  readonly nome: string;
  /** O módulo dono da rota, ou `null` quando é do Core (Painel, Store). */
  readonly moduleId: string | null;
  /** O que a tela faz — curado; ausente até termos texto real (Lei 7). */
  readonly descricao?: string;
  /** A orientação prática de operação — curada; ausente até termos texto. */
  readonly comoUsar?: string;
  /**
   * ⛔ **FRONTEIRA DE SIGILO — o padrão do PERITUS estendido ao Engenheiro.**
   *
   * A tela exibe dado sensível com trilha de LEITURA no banco (`record`, `exam`,
   * `prescription` — a Saúde, LGPD Art. 5º II). O sigilo já é imposto no banco
   * pela trilha auditada; aqui ele se estende ao Engenheiro: nestas rotas o
   * snapshot do formulário viaja SEM VALOR — só rótulo, preenchido/vazio e
   * obrigatoriedade. O modelo pode dizer "falta preencher o campo X", nunca QUAL
   * é o conteúdo clínico.
   *
   * A supressão é feita DUAS VEZES, de propósito: no navegador (o valor nem entra
   * na requisição) e de novo no servidor (`redactFields` — um cliente adulterado
   * não injeta dado clínico no prompt). Ver `MODELO-ENGENHEIRO §4`.
   */
  readonly sigilosa?: true;
}

/**
 * Os módulos cuja tela é SIGILOSA — a Saúde com trilha de leitura auditada.
 * ⚠️ O `patient` e o `appointment` NÃO entram: são cadastro demográfico e agenda,
 * write-trail, não PHI de leitura auditada. A fronteira cobre só o conteúdo
 * clínico (prontuário, exame, receita).
 */
const SIGILOSA_MODULES: ReadonlySet<string> = new Set(['record', 'exam', 'prescription']);

/**
 * O texto curado por página — só onde ele é REAL (Lei 7). Chaveado por `rota`.
 * As sigilosas ganham descrição para o modelo saber o que são; nunca o valor.
 */
const CURADORIA: Readonly<Record<string, { descricao: string; comoUsar: string }>> = {
  '/': {
    descricao:
      'O Painel Executivo do tenant: o panorama de quanto há em cada módulo contratado e o que exige atenção, com números que saem de contagem real, nunca de enfeite.',
    comoUsar:
      'Leia os cartões do topo para saber o volume de cada frente. Pergunte ao Engenheiro "quais as prioridades?" para um resumo das pendências dos módulos com prazo a que você tem acesso.',
  },
  '/agenda': {
    descricao:
      'A agenda médica: horários com profissional e paciente, e o desfecho de cada um — comparecimento, falta (no-show) ou cancelamento. Sem dado clínico.',
    comoUsar:
      'Filtre pela situação para ver o que está agendado hoje. Pergunte ao Engenheiro "como está a agenda?" para um resumo por situação, sem tocar em prontuário.',
  },
  '/prontuario': {
    descricao:
      'O prontuário do paciente — dado clínico com trilha de leitura auditada (LGPD). O conteúdo é sigiloso.',
    comoUsar:
      'O Engenheiro ajuda com a estrutura e o que cada campo pede, mas nunca lê nem repete o conteúdo clínico: os valores desta tela não chegam a ele.',
  },
  '/exames': {
    descricao:
      'Os exames do paciente, do pedido ao resultado — dado clínico com trilha de leitura auditada (LGPD). O resultado é sigiloso.',
    comoUsar:
      'O Engenheiro orienta sobre os campos e o fluxo pedido→resultado, mas o resultado em si não chega a ele: fica no sigilo da trilha.',
  },
  '/receitas': {
    descricao:
      'As receitas do paciente — a medicação prescrita, dado clínico com trilha de leitura auditada (LGPD). O conteúdo é sigiloso.',
    comoUsar:
      'O Engenheiro ajuda a estruturar a receita e explica os campos, mas a medicação em si não chega a ele: o valor é suprimido antes de sair da tela.',
  },
};

/** O Painel Executivo (home do tenant) — Core, fora do menu de módulos. */
const PAINEL: EnginePage = {
  rota: '/',
  nome: 'Painel Executivo',
  moduleId: null,
  descricao: CURADORIA['/']!.descricao,
  comoUsar: CURADORIA['/']!.comoUsar,
};

function paginaDeItem(item: { href: string; label: string; moduleId: string | null }): EnginePage {
  const curado = CURADORIA[item.href];
  const sigilosa = item.moduleId != null && SIGILOSA_MODULES.has(item.moduleId) ? true : undefined;
  return {
    rota: item.href,
    nome: item.label,
    moduleId: item.moduleId,
    ...(curado ? { descricao: curado.descricao, comoUsar: curado.comoUsar } : {}),
    ...(sigilosa ? { sigilosa } : {}),
  };
}

/**
 * O catálogo completo: o Painel + toda rota do menu, na ordem do menu.
 * Derivado — nunca digitado duas vezes.
 */
export const ENGINE_PAGES: readonly EnginePage[] = [
  PAINEL,
  ...ALL_MENU_ITEMS.map((i) => paginaDeItem(i)),
];

/**
 * A rota atual casa com uma página do catálogo?
 *
 * ⭐ Resolve a rota EXATA primeiro; depois a sub-rota de detalhe (`/contratos/abc`
 * cai em `/contratos`) pelo prefixo estático mais longo, na fronteira de
 * segmento. A raiz `/` só casa exata — senão engoliria tudo.
 */
export function pageOf(pathname?: string | null): EnginePage | undefined {
  if (!pathname) return undefined;
  const limpo = pathname.split('?')[0]!.replace(/\/+$/, '') || '/';

  const exata = ENGINE_PAGES.find((p) => p.rota === limpo);
  if (exata) return exata;

  let melhor: EnginePage | undefined;
  for (const p of ENGINE_PAGES) {
    if (p.rota === '/') continue; // a raiz não é prefixo de ninguém
    if (limpo === p.rota || limpo.startsWith(p.rota + '/')) {
      if (!melhor || p.rota.length > melhor.rota.length) melhor = p;
    }
  }
  return melhor;
}

/** Um campo do formulário visível na tela — capturado no navegador. */
export interface FormField {
  readonly rotulo: string;
  readonly preenchido: boolean;
  /**
   * AUSENTE em telas sigilosas — nessas rotas o campo viaja só com rótulo,
   * preenchido e obrigatório, nunca com o conteúdo. Ver `EnginePage.sigilosa`.
   */
  readonly valor?: string;
  readonly obrigatorio: boolean;
  readonly emFoco: boolean;
}

/**
 * ⛔ **A SEGUNDA CAMADA DA FRONTEIRA — a supressão no SERVIDOR.**
 *
 * Em tela sigilosa, remove `valor` de todo campo ANTES de montar o prompt. O
 * navegador já suprimiu (1ª camada); esta é a garantia contra um cliente
 * adulterado que tente injetar o conteúdo clínico. Fora de tela sigilosa, os
 * campos passam intactos.
 */
export function redactFields(
  fields: readonly FormField[] | undefined,
  sigilosa: boolean | undefined,
): readonly FormField[] | undefined {
  if (!fields || !fields.length) return fields;
  if (!sigilosa) return fields;
  return fields.map((f) => {
    if (f.valor === undefined) return f;
    const { valor: _omitido, ...resto } = f;
    return resto;
  });
}

/** Bloco de LOCALIZAÇÃO — diz ao modelo em que tela o usuário está agora. */
export function localizationBlock(page?: EnginePage): string {
  if (!page) return '';
  const detalhe = page.descricao ? ` O que ela faz: ${page.descricao}` : '';
  const uso = page.comoUsar ? ` Como usar: ${page.comoUsar}` : '';
  return (
    `LOCALIZAÇÃO: o usuário está agora na tela '${page.nome}' (${page.rota}).${detalhe}${uso} ` +
    "Quando ele disser 'esta tela', 'aqui' ou 'onde estou', é a esta página que se refere."
  );
}

/**
 * Bloco de FORMULÁRIO — o que está na tela e o que já foi preenchido.
 *
 * Em tela sigilosa os campos chegam sem `valor` (a supressão já ocorreu no
 * navegador e no servidor); aqui o bloco DIZ ao modelo que os valores estão
 * ocultos, para ele não pedir nem tentar deduzir o conteúdo.
 */
export function formSnapshotBlock(
  fields: readonly FormField[] | undefined,
  sigilosa?: boolean,
): string {
  if (!fields?.length) return '';
  const itens = fields.map((c) => {
    const req = c.obrigatorio ? ' (obrigatório)' : '';
    if (!c.preenchido) return `campo '${c.rotulo}' VAZIO${req}`;
    return c.valor === undefined
      ? `campo '${c.rotulo}' preenchido${req}`
      : `campo '${c.rotulo}' preenchido ('${c.valor}')${req}`;
  });
  const foco = fields.find((c) => c.emFoco);
  if (foco) itens.push(`o usuário está no campo '${foco.rotulo}'`);
  const sigilo = sigilosa
    ? ' Os VALORES desta tela estão OCULTOS por sigilo (trilha de leitura auditada): você sabe quais campos existem e quais estão vazios, mas não o conteúdo. Nunca peça, repita ou deduza o dado sigiloso.'
    : '';
  return (
    `FORMULÁRIO NA TELA: ${itens.join('; ')}.${sigilo} ` +
    'Ajude a preencher: explique o que vai em cada campo, aponte o que falta, e nunca invente valores.'
  );
}
