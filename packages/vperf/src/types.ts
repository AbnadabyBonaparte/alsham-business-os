/**
 * Tipos puros do Módulo 46 — Avaliação de Fornecedores.
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a avaliação PONTUAL
 * de um fornecedor pelo comprador.
 *
 * ⭐ O DIVERGE do `perf`: aqui NÃO HÁ ciclo (`CycleStatus`, `Cycle`) — a
 * avaliação de fornecedor não pertence a uma época; é um ato isolado. O que se
 * mantém do `perf` é a identidade: avaliador (`appraiserId`, carimbado pelo
 * servidor) × avaliado (aqui o fornecedor, `supplierId` + `supplierName`, ID
 * SOLTO ao `vendor`).
 *
 * @see supabase/migrations/0061_vperf.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-VPERF-SPEC.md — o fluxo de negócio
 */

/** Uma avaliação de fornecedor. Campos carimbados pelo servidor nascem vazios. */
export interface Appraisal {
  readonly id: string;
  /** ID SOLTO ao vendor — sem FK cruzada. */
  readonly supplierId: string;
  /** Carimbado pela tela no momento do registro. */
  readonly supplierName: string;
  /** A régua do método: 0–100, OBRIGATÓRIA. */
  readonly rating: number;
  readonly summary: string;
  /** A origem TEXTO LIVRE — "recebimento", "cotação". Pode ser vazio. */
  readonly sourceKind: string;
  /** A linha que motivou a avaliação, ID SOLTO opcional. */
  readonly sourceRef: string | null;
  /** Carimbado pelo SERVIDOR (auth.uid()) — nunca do formulário. */
  readonly appraiserId: string | null;
  readonly appraisedAt: string;
}

/** A entrada crua de uma avaliação nova — os campos vêm do formulário. */
export interface NewAppraisalInput {
  readonly supplierId?: unknown;
  readonly supplierName?: unknown;
  readonly rating?: unknown;
  readonly summary?: unknown;
  readonly sourceKind?: unknown;
  readonly sourceRef?: unknown;
}

/** Um resumo contável das avaliações. Todo número é `.length`, nunca chute. */
export interface AppraisalSummary {
  readonly total: number;
  /** Média das notas; `null` quando não há nenhuma avaliação (nunca zero fabricado). */
  readonly averageRating: number | null;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
