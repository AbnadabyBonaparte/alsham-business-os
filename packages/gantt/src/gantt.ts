/**
 * O motor puro do Módulo 59 — Gantt / Dependências entre marcos.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se uma dependência é válida.
 *
 * ⭐ **A RESSALVA DE HONESTIDADE.** O "Gantt", como conceito de mercado, é em boa
 * parte uma VISTA (um método de desenho sobre marcos que já existem no `sched`).
 * O dado GENUINAMENTE novo é a ARESTA de precedência — e é só isso que este
 * módulo guarda. Cálculo de caminho crítico, datas e cronograma NÃO moram aqui.
 *
 * ⭐ `wouldCycle` é LÓGICA DE APRESENTAÇÃO, não verdade do banco. A tela usa este
 * helper (alimentado com as arestas de FORA) para não OFERECER uma aresta que
 * fecharia um ciclo. O banco não conhece o grafo inteiro numa constraint; a
 * fonte da verdade da não-circularidade é a tela que compõe.
 */
import type {
  Dependency,
  DependencyEdge,
  DependencySummary,
  DependencyType,
  NewDependencyInput,
  Problem,
  Validation,
} from './types.ts';

/**
 * ⭐ As QUATRO relações clássicas de precedência — a física do domínio, espelho
 * do CHECK `gantt_dependencies_type` em `0074_gantt.sql`. `finish_to_start` é o
 * default (o caso de longe mais comum).
 */
export const DEPENDENCY_TYPES: readonly DependencyType[] = [
  'finish_to_start',
  'start_to_start',
  'finish_to_finish',
  'start_to_finish',
];

export const DEFAULT_DEPENDENCY_TYPE: DependencyType = 'finish_to_start';

function isDependencyType(v: unknown): v is DependencyType {
  return typeof v === 'string' && (DEPENDENCY_TYPES as readonly string[]).includes(v);
}

const NOME_MAX = 200;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida uma dependência nova.
 *
 * Predecessor e sucessor (ids soltos) são obrigatórios; a aresta de um marco
 * para SI MESMO é recusada (um marco não depende de si); o tipo é opcional e,
 * quando ausente, vira `finish_to_start`; os nomes e o projeto são opcionais.
 * Nasce com `id` vazio — a pura camada nunca inventa dado do servidor.
 *
 * ⚠️ Duplicidade de aresta e ciclo NÃO são checados aqui: a duplicidade é da
 * constraint única do banco; o ciclo é da tela, via `wouldCycle` (que precisa
 * do grafo inteiro, que a camada pura não tem).
 */
export function validateNewDependency(input: NewDependencyInput): Validation<Dependency> {
  const problems: Problem[] = [];

  const predecessorId = texto(input.predecessorId);
  if (predecessorId === null) {
    problems.push({ field: 'predecessorId', message: 'Informe o marco predecessor.' });
  }

  const successorId = texto(input.successorId);
  if (successorId === null) {
    problems.push({ field: 'successorId', message: 'Informe o marco sucessor.' });
  }

  // ⭐ Um marco não depende de si mesmo — a aresta laço é recusada (espelho do
  // CHECK `predecessor_id <> successor_id` no banco).
  if (predecessorId !== null && successorId !== null && predecessorId === successorId) {
    problems.push({
      field: 'successorId',
      message: 'Um marco não depende de si mesmo: predecessor e sucessor devem ser distintos.',
    });
  }

  const predecessorName = texto(input.predecessorName) ?? '';
  const successorName = texto(input.successorName) ?? '';
  const projectName = texto(input.projectName) ?? '';
  for (const [campo, valor] of [
    ['predecessorName', predecessorName],
    ['successorName', successorName],
    ['projectName', projectName],
  ] as const) {
    if (valor.length > NOME_MAX) {
      problems.push({ field: campo, message: `Nome com no máximo ${NOME_MAX} caracteres.` });
    }
  }

  // Tipo OPCIONAL — ausência/null viram o default; valor fora do conjunto recusa.
  let dependencyType: DependencyType = DEFAULT_DEPENDENCY_TYPE;
  if (input.dependencyType !== undefined && input.dependencyType !== null && input.dependencyType !== '') {
    if (!isDependencyType(input.dependencyType)) {
      problems.push({ field: 'dependencyType', message: 'Tipo de dependência inválido.' });
    } else {
      dependencyType = input.dependencyType;
    }
  }

  // Projeto OPCIONAL (id solto).
  const projectId = texto(input.projectId) ?? '';

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      predecessorId: predecessorId!,
      predecessorName,
      successorId: successorId!,
      successorName,
      dependencyType,
      projectId,
      projectName,
    },
  };
}

/**
 * ⭐ Detecta se adicionar a aresta `from → to` fecharia um CICLO no grafo de
 * dependências já existente. Lógica de APRESENTAÇÃO: alimentada com as arestas
 * de FORA (a tela), nunca é a verdade do banco — serve para a tela não oferecer
 * uma aresta que criaria uma precedência impossível ("A antes de B antes de A").
 *
 * A aresta laço (`from === to`) é ciclo trivial. Fora disso, há ciclo se já
 * existe um caminho de `to` de volta até `from` seguindo as setas
 * predecessor → sucessor.
 */
export function wouldCycle(
  edges: readonly DependencyEdge[],
  from: string,
  to: string,
): boolean {
  if (from === to) return true;

  const adjacencia = new Map<string, string[]>();
  for (const e of edges) {
    const lista = adjacencia.get(e.predecessorId) ?? [];
    lista.push(e.successorId);
    adjacencia.set(e.predecessorId, lista);
  }

  const visitados = new Set<string>();
  const pilha: string[] = [to];
  while (pilha.length > 0) {
    const no = pilha.pop()!;
    if (no === from) return true;
    if (visitados.has(no)) continue;
    visitados.add(no);
    for (const proximo of adjacencia.get(no) ?? []) pilha.push(proximo);
  }
  return false;
}

const ORDEM: Record<DependencyType, number> = {
  finish_to_start: 0,
  start_to_start: 1,
  finish_to_finish: 2,
  start_to_finish: 3,
};

/**
 * Ordena por tipo (na ordem canônica das quatro relações), depois pelo nome do
 * predecessor, depois pelo nome do sucessor — leitura estável para a tela.
 */
export function orderDependencies(deps: readonly Dependency[]): readonly Dependency[] {
  return [...deps].sort((a, b) => {
    if (ORDEM[a.dependencyType] !== ORDEM[b.dependencyType]) {
      return ORDEM[a.dependencyType] - ORDEM[b.dependencyType];
    }
    const p = a.predecessorName.localeCompare(b.predecessorName);
    if (p !== 0) return p;
    return a.successorName.localeCompare(b.successorName);
  });
}

export function summarizeDependencies(deps: readonly Dependency[]): DependencySummary {
  return {
    total: deps.length,
    finishToStart: deps.filter((d) => d.dependencyType === 'finish_to_start').length,
    startToStart: deps.filter((d) => d.dependencyType === 'start_to_start').length,
    finishToFinish: deps.filter((d) => d.dependencyType === 'finish_to_finish').length,
    startToFinish: deps.filter((d) => d.dependencyType === 'start_to_finish').length,
  };
}
