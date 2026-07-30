/**
 * Tipos do Módulo 19 — Checklists.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * O modelo é desenho do tenant; a execução CONGELA o modelo por cópia na
 * abertura; cada resposta é ato imutável; concluir exige tudo respondido.
 *
 * @see supabase/migrations/0034_chk.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-CHK-SPEC.md — o fluxo de negócio
 */

export type RunStatus = 'in_progress' | 'completed' | 'abandoned';

/** ⭐ Física da inspeção: conforme, não conforme, não se aplica. */
export type Answer = 'ok' | 'not_ok' | 'not_applicable';

export type TemplateStatus = 'active' | 'archived';

export interface ChkTemplate {
  readonly id: string;
  readonly name: string;
  readonly status: TemplateStatus;
}

export interface ChkTemplateItem {
  readonly id: string;
  readonly templateId: string;
  readonly position: number;
  readonly itemText: string;
  readonly status: TemplateStatus;
}

export interface ChecklistRun {
  readonly id: string;
  readonly templateId: string;
  /** ⭐ O nome do modelo CARIMBADO na abertura — sobrevive ao redesenho. */
  readonly templateName: string;
  readonly subject: string;
  readonly status: RunStatus;
  readonly startedAt: string;
  /** O ato da conclusão — do servidor. Terminal. */
  readonly completedAt: string | null;
  readonly abandonReason: string;
}

/** Um item da prancheta congelada — a resposta é ato, uma vez só. */
export interface ChkRunItem {
  readonly id: string;
  readonly runId: string;
  readonly position: number;
  /** ⭐ O texto carimbado na cópia — sem referência ao item de origem. */
  readonly itemText: string;
  readonly answer: Answer | null;
  readonly note: string;
  readonly answeredAt: string | null;
}

export interface NewTemplateInput {
  readonly name?: unknown;
  readonly items?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
