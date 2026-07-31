/**
 * Tipos puros do Módulo 55 — Kanban / Quadro de Tarefas do Projeto.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: as
 * colunas do quadro (etapas desenhadas pelo tenant) e os cartões que andam entre
 * elas.
 *
 * ⭐ A física é a do `ops` (etapas do tenant + itens que andam), mas ESCOPADA a
 * um projeto: tanto a etapa quanto o cartão carregam `projectId` (o do cartão é
 * OBRIGATÓRIO). É isso que faz este módulo ser "o quadro DE UM PROJETO" e não o
 * `ops` genérico reinstalado.
 *
 * ⛔ NÃO há status/ciclo de vida do cartão. O cartão VIVE numa etapa e ANDA;
 * "concluído" é uma ETAPA que o tenant desenha, nunca um enum do produto.
 *
 * @see supabase/migrations/0070_kanban.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-KANBAN-SPEC.md — o fluxo de negócio
 */

/**
 * Uma coluna do quadro (etapa). Nome em texto livre; a ordem é `position`; o
 * quadro pertence a um projeto (`projectId` solto + nome carimbado).
 */
export interface Stage {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly name: string;
  readonly position: number;
}

/**
 * Um cartão (tarefa). Vive numa coluna (`stageId`) e pertence a um projeto
 * (`projectId` OBRIGATÓRIO). Andar é trocar o `stageId` — nada mais.
 */
export interface Card {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly stageId: string;
  readonly title: string;
  readonly description: string;
}

export interface NewStageInput {
  readonly projectId?: unknown;
  readonly projectName?: unknown;
  readonly name?: unknown;
  readonly position?: unknown;
}

export interface NewCardInput {
  readonly projectId?: unknown;
  readonly projectName?: unknown;
  readonly stageId?: unknown;
  readonly title?: unknown;
  readonly description?: unknown;
}

/** Uma coluna com os cartões que estão nela — a leitura que a tela desenha. */
export interface StageColumn {
  readonly stage: Stage;
  readonly cards: readonly Card[];
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
