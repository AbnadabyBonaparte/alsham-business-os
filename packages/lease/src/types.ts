/**
 * Tipos do Módulo 39 — Locação de Lojistas (Vertical Shopping Centers).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐⭐ NÃO reescreve o ctr: vigência, reajuste, renovação e rescisão são
 * inteiramente do `ctr.contracts` (Módulo 13), referenciado aqui por
 * `contractId` — ID SOLTO, sem FK. O cadastro do lojista é do `mall.stores`
 * (Módulo 38), referenciado por `storeId` — também ID SOLTO. Aqui mora só o
 * termo comercial sobre vendas (`revenueShare`, TEXTO LIVRE) e o relatório
 * mensal de vendas do lojista.
 *
 * @see supabase/migrations/0054_lease.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-LEASE-SPEC.md — o fluxo de negócio
 */

export type AgreementStatus = 'active' | 'ended';

export interface Agreement {
  readonly id: string;
  /** ID SOLTO ao ctr — sem FK. O contrato vive lá. */
  readonly contractId: string;
  readonly contractRef: string;
  /** ID SOLTO ao mall — sem FK. O cadastro do lojista vive lá. */
  readonly storeId: string;
  readonly storeName: string;
  /** O termo comercial sobre vendas — TEXTO LIVRE, dado do tenant. */
  readonly revenueShare: string;
  /** active → ended: a única transição. TERMINAL e FROZEN. */
  readonly status: AgreementStatus;
  readonly endReason: string;
  readonly endedAt: string | null;
}

export interface NewAgreementInput {
  readonly contractId?: unknown;
  readonly contractRef?: unknown;
  readonly storeId?: unknown;
  readonly storeName?: unknown;
  readonly revenueShare?: unknown;
}

export interface SalesReport {
  readonly id: string;
  readonly agreementId: string;
  readonly competency: string;
  readonly reportedAmountCents: number;
  readonly currency: string | null;
  readonly note: string;
  readonly reportedAt: string;
}

export interface NewSalesReportInput {
  readonly agreementId?: unknown;
  readonly competency?: unknown;
  readonly reportedAmountCents?: unknown;
  readonly currency?: unknown;
  readonly note?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
