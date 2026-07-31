/**
 * Tipos puros do Módulo 53 — Projetos.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o
 * projeto e o seu ciclo de vida (planning → active → completed/cancelled, os
 * dois últimos terminais).
 *
 * A física do encerramento é a do `bud`/`dem` (o terminal não reabre), com a
 * assimetria assinada: cancelar exige RAZÃO; concluir tem nota OPCIONAL.
 *
 * @see supabase/migrations/0068_proj.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-PROJ-SPEC.md — o fluxo de negócio
 */

/**
 * O estado de um projeto.
 *
 * ⭐ `completed` e `cancelled` são TERMINAIS: o projeto encerrado não reabre (a
 * física do `bud`/`dem`). O próximo é projeto novo.
 */
export type ProjectStatus = 'planning' | 'active' | 'completed' | 'cancelled';

/**
 * Um projeto. Nome e descrição em texto livre; campos carimbados pelo servidor
 * (activated/closed) nascem nulos.
 */
export interface Project {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: ProjectStatus;
  /** Nota de conclusão — opcional (o fim natural não se justifica). */
  readonly completionNote: string;
  /** Razão do cancelamento — obrigatória em `cancelled`, vazia fora dele. */
  readonly cancelReason: string;
}

export interface NewProjectInput {
  readonly name?: unknown;
  readonly description?: unknown;
}

/** Um resumo contável dos projetos. Todo número é `.length`, nunca chute. */
export interface ProjectSummary {
  readonly total: number;
  readonly planning: number;
  readonly active: number;
  readonly completed: number;
  readonly cancelled: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
