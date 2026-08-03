/**
 * Tipos puros do Módulo 92 — Licitações (Bid).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a
 * licitação ancorada num edital, os itens licitados, as propostas dos licitantes
 * e o ciclo de vida (publicar CONGELA; homologar/cancelar são terminais).
 *
 * A licitação reusa a IDENTIDADE do `rfq` (quem CONDUZ decide, não o fornecedor),
 * com um DIVERGE assinado: aqui o terminal é a HOMOLOGAÇÃO (`homologated`, o
 * ato solene da Lei 14.133 — mais que o `awarded` neutro do `rfq`).
 *
 * @see supabase/migrations/0107_bid.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-BID-SPEC.md — o fluxo de negócio
 */

/**
 * O estado de uma licitação.
 *
 * ⭐ `homologated` e `cancelled` são TERMINAIS: a licitação tem identidade por
 * EDITAL (a régua do `rfq`/`quote`). Refazer é licitação nova. O DIVERGE do
 * `rfq`: o terminal é a HOMOLOGAÇÃO do órgão (`homologated`), não o prêmio neutro
 * (`awarded`).
 */
export type TenderStatus = 'draft' | 'open' | 'homologated' | 'cancelled';

/** Um item licitado — TEXTO LIVRE, sem catálogo (o molde do `rfq`). */
export interface TenderLine {
  readonly lineNo: number;
  readonly item: string;
  /** Quantidade licitada (> 0). */
  readonly quantity: number;
  /** Unidade em texto livre ("kg", "h", "un"). Opcional — pode ser vazia. */
  readonly unit: string;
}

/**
 * Uma proposta recebida de um licitante. O licitante é ID SOLTO + nome carimbado
 * — a licitação não conhece o schema do fornecedor. A proposta é um FATO
 * CONSUMADO: uma vez registrada, não se rasura (corrigir é outra proposta).
 */
export interface Proposal {
  /** O licitante (id solto). Opcional — pode não ter cadastro. */
  readonly bidderId: string | null;
  /** O nome do licitante, carimbado pela tela. */
  readonly bidderName: string;
  /** O valor proposto, em centavos (>= 0). */
  readonly amountCents: number;
  /** A moeda do valor ("BRL"). */
  readonly currency: string;
  /** Observação livre sobre a proposta. Opcional. */
  readonly note: string;
}

/**
 * Uma licitação. O vencedor é ID SOLTO + nome carimbado (o padrão do `rfq`) — a
 * licitação não conhece o schema do fornecedor. Campos carimbados pelo servidor
 * nascem vazios/nulos.
 */
export interface Tender {
  readonly id: string;
  readonly title: string;
  /** A descrição do edital (texto livre). */
  readonly description: string;
  /** A modalidade da licitação em TEXTO LIVRE ("pregão", "concorrência"…). */
  readonly modality: string;
  readonly status: TenderStatus;
  /** O licitante homologado (id solto). `null` fora de `homologated`. */
  readonly homologatedBidderId: string | null;
  /** O nome do vencedor, carimbado pela tela. Vazio fora de `homologated`. */
  readonly homologatedBidderName: string;
  /** Razão do cancelamento. Vazia fora de `cancelled`. */
  readonly cancelReason: string;
  readonly lines: readonly TenderLine[];
}

export interface NewTenderLineInput {
  readonly item?: unknown;
  readonly quantity?: unknown;
  readonly unit?: unknown;
}

export interface NewTenderInput {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly modality?: unknown;
  readonly lines?: unknown;
}

export interface NewProposalInput {
  readonly bidderId?: unknown;
  readonly bidderName?: unknown;
  readonly amountCents?: unknown;
  readonly currency?: unknown;
  readonly note?: unknown;
}

/** Um resumo contável do cadastro. Todo número é `.length`, nunca chute. */
export interface TenderSummary {
  readonly total: number;
  readonly draft: number;
  readonly open: number;
  readonly homologated: number;
  readonly cancelled: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
