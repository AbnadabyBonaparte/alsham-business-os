/**
 * Tipos puros do Módulo 59 — Gantt / Dependências entre marcos.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a
 * ARESTA de precedência entre dois marcos ("o marco B não começa antes do marco
 * A"). O dado GENUINAMENTE novo deste módulo é a aresta — o marco em si é do
 * `sched` (Módulo 54), referenciado por id solto, jamais lido.
 *
 * ⭐ **Registro MUTÁVEL, não livro imutável.** A aresta é METADADO DO PLANO: some
 * quando o plano muda (delete permitido). É o DIVERGE consciente dos livros
 * imutáveis (recv/pcost), onde o fato consumado nunca se apaga.
 *
 * @see supabase/migrations/0074_gantt.sql
 * @see docs/canon/MODULO-GANTT-SPEC.md
 */

/**
 * O tipo da dependência — as QUATRO relações clássicas de precedência.
 *
 * ⭐ É a FÍSICA do domínio (as quatro relações reais entre início/fim de duas
 * tarefas), não vocabulário do tenant. Por isso é um conjunto FECHADO (CHECK no
 * banco), diferente de "canal", "categoria" ou "segmento", que são texto livre.
 *   - `finish_to_start`  — o sucessor só começa quando o predecessor termina (o
 *                          caso de longe mais comum: o default).
 *   - `start_to_start`   — os dois começam juntos (o sucessor não começa antes
 *                          de o predecessor começar).
 *   - `finish_to_finish` — os dois terminam juntos.
 *   - `start_to_finish`  — o sucessor só termina quando o predecessor começa.
 */
export type DependencyType =
  | 'finish_to_start'
  | 'start_to_start'
  | 'finish_to_finish'
  | 'start_to_finish';

/**
 * Uma dependência — a aresta predecessor → sucessor.
 *
 * Os dois marcos entram por id solto (`predecessorId`/`successorId`) + nome
 * carimbado pela tela. O projeto é um vínculo solto OPCIONAL (a dependência vive
 * dentro do contexto de um projeto, mas nem sempre há um a informar).
 */
export interface Dependency {
  readonly id: string;
  /** Id solto ao marco do `sched` que precede — sem FK. */
  readonly predecessorId: string;
  /** Nome do marco predecessor carimbado pela tela. */
  readonly predecessorName: string;
  /** Id solto ao marco do `sched` que sucede — sem FK. */
  readonly successorId: string;
  /** Nome do marco sucessor carimbado pela tela. */
  readonly successorName: string;
  readonly dependencyType: DependencyType;
  /** Vínculo solto OPCIONAL ao projeto do `proj` (vazio quando ausente). */
  readonly projectId: string;
  readonly projectName: string;
}

export interface NewDependencyInput {
  readonly predecessorId?: unknown;
  readonly predecessorName?: unknown;
  readonly successorId?: unknown;
  readonly successorName?: unknown;
  readonly dependencyType?: unknown;
  readonly projectId?: unknown;
  readonly projectName?: unknown;
}

/**
 * Uma aresta reduzida ao que importa para a detecção de ciclo: quem precede,
 * quem sucede. Alimentada de FORA (a tela passa as arestas já existentes).
 */
export interface DependencyEdge {
  readonly predecessorId: string;
  readonly successorId: string;
}

/** Um resumo contável das dependências. Todo número é `.length`, nunca chute. */
export interface DependencySummary {
  readonly total: number;
  readonly finishToStart: number;
  readonly startToStart: number;
  readonly finishToFinish: number;
  readonly startToFinish: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
