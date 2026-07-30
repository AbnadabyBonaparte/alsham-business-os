/**
 * Tipos do Módulo 40 — Fundo de Promoção (Vertical Shopping Centers).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⚠️ Anti-viés: nada aqui pressupõe o cliente inaugural. O contribuinte
 * (`storeId`) é um id solto ao `mall.stores` — este pacote não sabe o que é
 * um "lojista", só que alguém contribuiu. A campanha (`campaignId`) é um id
 * solto à `marketing`, opcional.
 *
 * @see supabase/migrations/0055_fund.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-FUND-SPEC.md — o fluxo de negócio
 */

export interface Contribution {
  readonly id: string;
  /** Id solto ao mall.stores — sem FK. */
  readonly storeId: string;
  readonly storeName: string;
  readonly competenceOn: string;
  readonly amountCents: number;
  readonly currency: string | null;
  readonly note: string;
}

export interface Expense {
  readonly id: string;
  /** Id solto à marketing (campanha) — sem FK. Opcional. */
  readonly campaignId: string | null;
  readonly campaignName: string;
  readonly amountCents: number;
  readonly currency: string | null;
  /** Razão obrigatória — gasto sem razão é a linha muda que esconde o desvio. */
  readonly reason: string;
}

export interface NewContributionInput {
  readonly storeId?: unknown;
  readonly storeName?: unknown;
  readonly competenceOn?: unknown;
  readonly amountCents?: unknown;
  readonly currency?: unknown;
  readonly note?: unknown;
}

export interface NewExpenseInput {
  readonly campaignId?: unknown;
  readonly campaignName?: unknown;
  readonly amountCents?: unknown;
  readonly currency?: unknown;
  readonly reason?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
