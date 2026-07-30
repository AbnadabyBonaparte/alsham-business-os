/**
 * Tipos do Módulo 27 — Pesquisas.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * A régua 0–10 é física do MÉTODO (convenção mundial do NPS); a pergunta
 * é texto do tenant; a resposta é ato imutável; o placar é calculado do
 * livro; `closed` é terminal — a rodada que volta é pesquisa nova.
 *
 * @see supabase/migrations/0042_nps.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-NPS-SPEC.md — o fluxo de negócio
 */

export type SurveyStatus = 'draft' | 'open' | 'closed';

export interface Survey {
  readonly id: string;
  readonly title: string;
  /** A pergunta é do TENANT — a régua é do método; as palavras, dele. */
  readonly question: string;
  readonly status: SurveyStatus;
  readonly openedAt: string | null;
  readonly closedAt: string | null;
}

/** Uma resposta — ato do livro: imutável, carimbada, na régua do método. */
export interface SurveyResponse {
  readonly id: string;
  readonly seq: number;
  readonly surveyId: string;
  /** 0–10 — a régua mundial: detrator 0–6, neutro 7–8, promotor 9–10. */
  readonly score: number;
  readonly comment: string;
  /** Respondente NEUTRO e OPCIONAL — LGPD-mínimo ("mesa 12"). */
  readonly respondent: string;
  readonly respondedAt: string;
}

/** O placar de uma pesquisa — SEMPRE calculado, nunca guardado. */
export interface SurveyScore {
  readonly responses: number;
  readonly promoters: number;
  readonly passives: number;
  readonly detractors: number;
  /** %promotores − %detratores, arredondado. */
  readonly score: number;
}

export interface NewSurveyInput {
  readonly title?: unknown;
  readonly question?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
