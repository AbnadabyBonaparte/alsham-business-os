/**
 * Tipos puros do Módulo 51 — Distribuição / Despacho (Dispatch).
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o despacho como
 * ATO PONTUAL — o que saiu, para onde, quanto e quando. Não há ciclo de vida
 * (é fato consumado), então não há `Status` nem transição neste módulo.
 *
 * ⭐ É o ESPELHO INVERTIDO do `recv` (o Módulo 45 — o livro de RECEBIMENTOS): o
 * `recv` é a CHEGADA, o `disp` é a SAÍDA. Mesma física do ato pontual imutável.
 */

/** Um despacho registrado. Campos carimbados pelo servidor nascem vazios. */
export interface Dispatch {
  readonly id: string;
  /** ID SOLTO ao centro de distribuição — pode faltar (despacho sem centro). */
  readonly dcCenterId: string | null;
  /** O nome do centro de distribuição carimbado pela tela. Pode ser vazio. */
  readonly dcCenterName: string;
  /** Para onde a carga foi — TEXTO LIVRE, obrigatório. */
  readonly destination: string;
  /** A transportadora — TEXTO LIVRE, opcional. */
  readonly carrier: string;
  /** Quanto saiu — > 0. */
  readonly quantity: number;
  /** O dia do despacho — `YYYY-MM-DD`. */
  readonly dispatchedOn: string;
  /** Nota TEXTO LIVRE, opcional. */
  readonly note: string;
}

/** A entrada crua de um despacho novo — os campos vêm do formulário. */
export interface NewDispatchInput {
  readonly dcCenterId?: unknown;
  readonly dcCenterName?: unknown;
  readonly destination?: unknown;
  readonly carrier?: unknown;
  readonly quantity?: unknown;
  readonly dispatchedOn?: unknown;
  readonly note?: unknown;
}

/** Um resumo contável do livro. Todo número é `.length`/soma, nunca chute. */
export interface DispatchSummary {
  readonly total: number;
  readonly totalQuantity: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
