/**
 * Tipos puros do Módulo 61 — Apontamento de horas (Timesheet).
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o apontamento como
 * LANÇAMENTO IMUTÁVEL — quantas horas alguém trabalhou, em qual projeto e em
 * que dia. Não há ciclo de vida (é fato consumado), então não há `Status` nem
 * transição neste módulo. E não há trave: o apontamento só narra a hora
 * trabalhada.
 *
 * ⭐ O contraste assinado: o `alloc` (Módulo 56) é o PLANEJADO — o percentual de
 * capacidade que se PRETENDE dedicar, mutável (active ↔ archived). O
 * `timesheet` é o REALIZADO — a hora que FOI trabalhada, fato consumado e
 * imutável. Um é a promessa, o outro é o que aconteceu.
 *
 * @see supabase/migrations/0076_timesheet.sql
 * @see docs/canon/MODULO-TIMESHEET-SPEC.md
 */

/** Um apontamento de horas. Campos carimbados pelo servidor nascem vazios. */
export interface TimesheetEntry {
  readonly id: string;
  /** ID SOLTO ao projeto (proj) — obrigatório. */
  readonly projectId: string;
  /** O nome do projeto carimbado pela tela. Pode ser vazio. */
  readonly projectName: string;
  /**
   * O nome de quem trabalhou, em TEXTO LIVRE — pode ser um terceiro/freelancer
   * sem cadastro (a lição do recurso do `alloc`). Obrigatório e não-vazio.
   */
  readonly collaboratorName: string;
  /**
   * O colaborador do módulo de Colaboradores por ID SOLTO, OPCIONAL: nem todo
   * apontamento tem um colaborador cadastrado (o executor pode ser externo).
   * `null` quando ausente.
   */
  readonly collaboratorId: string | null;
  /** O dia em que o trabalho aconteceu — `YYYY-MM-DD`, obrigatório. */
  readonly workedOn: string;
  /**
   * As horas trabalhadas. SEMPRE `> 0`: não se aponta zero nem trabalho
   * negativo — um apontamento é a narrativa de um esforço que existiu. Corrigir
   * é lançar o ato inverso, nunca reescrever.
   */
  readonly hours: number;
  /** Descrição TEXTO LIVRE, OPCIONAL. */
  readonly description: string;
}

/** A entrada crua de um apontamento novo — os campos vêm do formulário. */
export interface NewTimesheetEntryInput {
  readonly projectId?: unknown;
  readonly projectName?: unknown;
  readonly collaboratorName?: unknown;
  readonly collaboratorId?: unknown;
  readonly workedOn?: unknown;
  readonly hours?: unknown;
  readonly description?: unknown;
}

/** O total de horas de um colaborador — soma pura do livro. */
export interface CollaboratorHours {
  readonly collaboratorName: string;
  readonly totalHours: number;
  readonly count: number;
}

/** Um resumo contável do livro. Todo número é `.length`/soma, nunca chute. */
export interface TimesheetSummary {
  readonly total: number;
  readonly totalHours: number;
  readonly byCollaborator: readonly CollaboratorHours[];
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
