/**
 * Tipos puros do Módulo 45 — Recebimento (Goods Receipt).
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o recebimento como
 * ATO PONTUAL — o que chegou, quanto e quando. Não há ciclo de vida (é fato
 * consumado), então não há `Status` nem transição neste módulo.
 */

/** Um recebimento registrado. Campos carimbados pelo servidor nascem vazios. */
export interface Receipt {
  readonly id: string;
  /** ID SOLTO ao pedido (po) — pode faltar (recebimento sem pedido). */
  readonly orderId: string | null;
  /** O número/nome do pedido carimbado pela tela. Pode ser vazio. */
  readonly orderRef: string;
  /** O que chegou — TEXTO LIVRE, obrigatório. */
  readonly item: string;
  /** Quanto chegou — > 0, SEM teto (a sobra é fato — o paralelo recv × ar). */
  readonly quantity: number;
  /** O dia do recebimento — `YYYY-MM-DD`. */
  readonly receivedOn: string;
  /** Nota TEXTO LIVRE, opcional. */
  readonly note: string;
}

/** A entrada crua de um recebimento novo — os campos vêm do formulário. */
export interface NewReceiptInput {
  readonly orderId?: unknown;
  readonly orderRef?: unknown;
  readonly item?: unknown;
  readonly quantity?: unknown;
  readonly receivedOn?: unknown;
  readonly note?: unknown;
}

/** Um resumo contável do livro. Todo número é `.length`/soma, nunca chute. */
export interface ReceiptSummary {
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
