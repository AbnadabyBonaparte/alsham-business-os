/**
 * Tipos puros do Módulo 62 — Portfólio de projetos.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o
 * portfólio (o agrupamento de projetos para leitura executiva) e o seu ciclo
 * (`active ↔ archived`, os dois sentidos), mais o vínculo N:N com os projetos
 * (o membro).
 *
 * ⭐ **A ÚLTIMA peça:** fecha o Domain PMO & Projetos em 10/10 capacidades.
 * O vínculo ao projeto é por ID SOLTO (o `proj` não é lido); o vínculo do
 * membro ao portfólio, por sua vez, é INTRA-schema — o membro é uma peça do
 * próprio portfólio, não de outro módulo.
 *
 * @see supabase/migrations/0077_pfolio.sql
 * @see docs/canon/MODULO-PFOLIO-SPEC.md
 */

/**
 * O estado de um portfólio.
 *
 * ⭐ `active ↔ archived` nos DOIS sentidos (o reaproveitamento do `vendor`/`dc`
 * — o DIVERGE dos fins TERMINAIS do `proj`): um portfólio arquivado é o MESMO
 * portfólio que pode voltar; arquivar é metadado reversível, não um fim.
 */
export type PortfolioStatus = 'active' | 'archived';

/** Um portfólio: o agrupamento. Nome/descrição em texto livre. */
export interface Portfolio {
  readonly id: string;
  readonly name: string;
  /** Descrição TEXTO LIVRE. Pode ser vazia. */
  readonly description: string;
  readonly status: PortfolioStatus;
}

/**
 * Um membro: o vínculo N:N entre um portfólio e um projeto.
 *
 * O projeto entra por ID SOLTO (`projectId` — sem FK cross-schema) + nome
 * carimbado pela tela (`projectName`). O MESMO projeto pode estar em VÁRIOS
 * portfólios — a unicidade é por `(portfólio, projeto)`, nunca global.
 */
export interface Member {
  readonly id: string;
  readonly portfolioId: string;
  readonly projectId: string;
  readonly projectName: string;
}

/** A entrada crua de um portfólio novo — os campos vêm do formulário. */
export interface NewPortfolioInput {
  readonly name?: unknown;
  readonly description?: unknown;
}

/** A entrada crua de um membro novo — portfólio + projeto. */
export interface NewMemberInput {
  readonly portfolioId?: unknown;
  readonly projectId?: unknown;
  readonly projectName?: unknown;
}

/** Um resumo contável dos portfólios. Todo número é `.length`, nunca chute. */
export interface PortfolioSummary {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
