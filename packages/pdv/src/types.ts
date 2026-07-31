/**
 * Tipos puros do Módulo 71 — Ponto de Venda (PDV).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a
 * venda comercial (o cupom do balcão), os itens que se vendeu, e o ciclo de
 * vida (finalizar CONGELA; completed/cancelled são terminais).
 *
 * ⛔ Esta é a VENDA COMERCIAL, NÃO o documento fiscal: não há NF-e/NFC-e, não
 * se assina nada, não se fala com a SEFAZ (isso é integração fiscal
 * certificada — Lei 3). Aqui é o registro do que se vendeu, por quanto, para
 * quem.
 *
 * ⭐ A física é a do `rfq`/`quote` (cabeçalho + itens que congelam ao
 * finalizar), RE-PERGUNTADA e com o DIVERGE assinado: a venda NÃO tem o
 * meio-termo `open` da RFQ (que vai ao mercado). Ou está sendo montada
 * (`draft`) ou fechou (`completed`/`cancelled`) — o cupom fecha na hora.
 *
 * @see supabase/migrations/0086_pdv.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-PDV-SPEC.md — o fluxo de negócio
 */

/**
 * O estado de uma venda.
 *
 * ⭐ `completed` e `cancelled` são TERMINAIS: a venda tem identidade por CUPOM
 * (a física do `proj`/`bud`). Venda cancelada não reabre — refazer é venda
 * nova. Sem estado intermediário (o DIVERGE do `rfq`, que tem `open`).
 */
export type SaleStatus = 'draft' | 'completed' | 'cancelled';

/**
 * Uma venda. O cliente é ID SOLTO ao `crm` (opcional — venda de balcão é
 * anônima) + nome carimbado pela tela. O desconto (a Promoção simples, como
 * CAMPO) é valor fixo em centavos, >= 0.
 */
export interface Sale {
  readonly id: string;
  /** Operador/caixa em texto livre (quem operou o balcão). */
  readonly operator: string;
  /** Método de pagamento em texto livre — nunca enum (dinheiro/cartão/pix). */
  readonly paymentMethod: string;
  /** O cliente por id solto ao crm. `null` na venda anônima. */
  readonly customerId: string | null;
  /** O nome do cliente, carimbado pela tela. Vazio na venda anônima. */
  readonly customerName: string;
  /** O desconto da venda (a Promoção como campo). Em centavos, >= 0. */
  readonly discountCents: number;
  readonly currency: string;
  readonly status: SaleStatus;
}

/** Uma linha da venda — produto por id solto ao catalog OU texto livre. */
export interface SaleItem {
  readonly lineNo: number;
  /** O produto por id solto ao catalog. `null` no preço avulso. */
  readonly productId: string | null;
  /** O nome do produto, carimbado pela tela. Obrigatório. */
  readonly productName: string;
  /** Quantidade vendida (> 0). */
  readonly quantity: number;
  /** Preço unitário em centavos (>= 0). */
  readonly unitPriceCents: number;
}

export interface NewSaleInput {
  readonly operator?: unknown;
  readonly paymentMethod?: unknown;
  readonly customerId?: unknown;
  readonly customerName?: unknown;
  readonly discountCents?: unknown;
  readonly currency?: unknown;
}

export interface NewSaleItemInput {
  readonly productId?: unknown;
  readonly productName?: unknown;
  readonly quantity?: unknown;
  readonly unitPriceCents?: unknown;
}

/**
 * O total da venda — calculado das linhas (nunca coluna; a física da view
 * `pdv.sale_totals`). Bruto = Σ quantidade × preço; líquido = bruto − desconto,
 * nunca abaixo de zero.
 */
export interface SaleTotals {
  readonly grossCents: number;
  readonly discountCents: number;
  readonly netCents: number;
  readonly itemCount: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
