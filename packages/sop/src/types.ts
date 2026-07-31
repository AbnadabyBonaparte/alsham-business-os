/**
 * Tipos puros do Módulo 49 — S&OP / Rodadas de Consenso.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a
 * rodada de consenso, o vínculo SOLTO com um plano de demanda, e o ciclo de
 * vida (aprovar CONGELA; approved é terminal).
 *
 * ⭐ A rodada NÃO é o plano de novo — é a CAMADA DE GOVERNANÇA sobre ele. Ela
 * REFERENCIA um plano por ID SOLTO (`planId`) + nome carimbado (`planName`, o
 * padrão do `deal`) — nunca uma FK, nunca lendo o schema do plano. O consenso é
 * REGISTRADO por gente (aprovado), não calculado.
 *
 * @see supabase/migrations/0064_sop.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-SOP-SPEC.md — o fluxo de negócio
 */

/**
 * O estado de uma rodada de consenso.
 *
 * ⭐ `approved` e `cancelled` são TERMINAIS: a próxima rodada é rodada nova.
 * Aprovar CONGELA a rodada — o consenso, uma vez fechado, é aquele documento.
 */
export type RoundStatus = 'draft' | 'approved' | 'cancelled';

/**
 * Uma rodada de S&OP. O período é TEXTO LIVRE (o ciclo é dado do tenant). O
 * plano referenciado é ID SOLTO + nome carimbado (a governança não conhece o
 * schema do plano). Campos carimbados pelo servidor nascem vazios/nulos.
 */
export interface Round {
  readonly id: string;
  /** O ciclo de consenso em texto livre ("Q1 2027", "Ciclo Março/2027"). */
  readonly period: string;
  readonly title: string;
  /** O plano de demanda referenciado (ID SOLTO). `null` quando não há vínculo. */
  readonly planId: string | null;
  /** O nome do plano, carimbado pela tela. Vazio quando não há vínculo. */
  readonly planName: string;
  readonly status: RoundStatus;
  /** Razão do cancelamento. Vazia fora de `cancelled`. */
  readonly cancelReason: string;
}

export interface NewRoundInput {
  readonly period?: unknown;
  readonly title?: unknown;
  readonly planId?: unknown;
  readonly planName?: unknown;
}

/** Um resumo contável das rodadas. Todo número é `.length`, nunca chute. */
export interface RoundSummary {
  readonly total: number;
  readonly draft: number;
  readonly approved: number;
  readonly cancelled: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
