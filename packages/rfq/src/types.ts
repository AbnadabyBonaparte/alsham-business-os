/**
 * Tipos puros do Módulo 44 — Cotações / RFQ (Request For Quotation).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a
 * cotação, os itens que se pede ao mercado, e o ciclo de vida (enviar CONGELA;
 * premiar/cancelar são terminais).
 *
 * A RFQ reusa a IDENTIDADE do `quote` (o documento que congela ao enviar), com
 * um DIVERGE assinado: aqui o terminal é a ESCOLHA DO COMPRADOR (`awarded`, o
 * fornecedor vencedor por id solto), não a resposta do cliente.
 *
 * @see supabase/migrations/0059_rfq.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-RFQ-SPEC.md — o fluxo de negócio
 */

/**
 * O estado de uma cotação.
 *
 * ⭐ `awarded` e `cancelled` são TERMINAIS: a cotação tem identidade por
 * DOCUMENTO (a régua do `quote`). Refazer é cotação nova. O DIVERGE do `quote`:
 * o terminal é a escolha do comprador (`awarded`), não a resposta do cliente
 * (`accepted`/`declined`).
 */
export type RequestStatus = 'draft' | 'open' | 'awarded' | 'cancelled';

/** Um item cotado — TEXTO LIVRE, sem catálogo (o molde do `quote`). */
export interface RequestLine {
  readonly lineNo: number;
  readonly item: string;
  /** Quantidade cotada (> 0). */
  readonly quantity: number;
  /** Unidade em texto livre ("kg", "h", "un"). Opcional — pode ser vazia. */
  readonly unit: string;
}

/**
 * Uma cotação. O vencedor é ID SOLTO + nome carimbado (o padrão do `deal`) — a
 * RFQ não conhece o schema do fornecedor. Campos carimbados pelo servidor
 * nascem vazios/nulos.
 */
export interface Request {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly status: RequestStatus;
  /** O fornecedor premiado (id solto). `null` fora de `awarded`. */
  readonly awardedSupplierId: string | null;
  /** O nome do vencedor, carimbado pela tela. Vazio fora de `awarded`. */
  readonly awardedSupplierName: string;
  /** Razão do cancelamento. Vazia fora de `cancelled`. */
  readonly cancelReason: string;
  readonly lines: readonly RequestLine[];
}

export interface NewRequestLineInput {
  readonly item?: unknown;
  readonly quantity?: unknown;
  readonly unit?: unknown;
}

export interface NewRequestInput {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly lines?: unknown;
}

/** Um resumo contável do cadastro. Todo número é `.length`, nunca chute. */
export interface RequestSummary {
  readonly total: number;
  readonly draft: number;
  readonly open: number;
  readonly awarded: number;
  readonly cancelled: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
