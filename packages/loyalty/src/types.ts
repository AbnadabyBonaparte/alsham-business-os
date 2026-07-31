/**
 * Tipos puros do Módulo 74 — Fidelidade (Loyalty).
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o movimento de pontos
 * como LANÇAMENTO IMUTÁVEL — o cliente ganhou X pontos numa compra, ou resgatou
 * Y numa troca. Não há ciclo de vida (é fato consumado), então não há `Status`
 * nem transição neste módulo.
 *
 * ⭐⭐ A DIREÇÃO mora no TIPO (`entry_type`), a "sinal do tipo" do `cash`
 * re-perguntada para os pontos: `points` é SEMPRE > 0, e o que soma ou subtrai é
 * o TIPO (`earn` soma, `redeem` subtrai). É o DIVERGE assinado do `timesheet`
 * (que acumula numa direção só) e do `pcost` (livro de gasto `<> 0`).
 *
 * @see supabase/migrations/0089_loyalty.sql
 * @see docs/canon/MODULO-LOYALTY-SPEC.md
 */

/** A direção do movimento: ganhar pontos ou resgatá-los. */
export type EntryType = 'earn' | 'redeem';

/** Um movimento de pontos. Campos carimbados pelo servidor nascem vazios. */
export interface LoyaltyEntry {
  readonly id: string;
  /** ID SOLTO ao cliente (crm) — OBRIGATÓRIO: não há ponto sem dono. */
  readonly customerId: string;
  /** O nome do cliente carimbado pela tela. Pode ser vazio. */
  readonly customerName: string;
  /** A direção: `earn` soma, `redeem` subtrai. O sinal é o TIPO, nunca o número. */
  readonly entryType: EntryType;
  /**
   * Os pontos do movimento. SEMPRE `> 0` e inteiro: não se lança zero nem
   * pontos negativos — o sinal é o `entryType`. Corrigir é lançar o ato inverso,
   * nunca reescrever.
   */
  readonly points: number;
  /** O motivo TEXTO LIVRE, OPCIONAL ("compra", "resgate — brinde", "expiração"). */
  readonly reason: string;
  /**
   * A origem por ID SOLTO, OPCIONAL: a venda que gerou os pontos (o pdv), sem FK
   * cruzada. `null` quando ausente (um ajuste manual não tem venda).
   */
  readonly sourceId: string | null;
}

/** A entrada crua de um movimento novo — os campos vêm do formulário. */
export interface NewEntryInput {
  readonly customerId?: unknown;
  readonly customerName?: unknown;
  readonly entryType?: unknown;
  readonly points?: unknown;
  readonly reason?: unknown;
  readonly sourceId?: unknown;
}

/**
 * O saldo de um cliente — a soma pura do livro (Σ earn − Σ redeem), nunca
 * coluna. Espelha a VIEW `loyalty.customer_balances`.
 */
export interface CustomerBalance {
  readonly customerId: string;
  readonly balancePoints: number;
  readonly earnCount: number;
  readonly redeemCount: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
