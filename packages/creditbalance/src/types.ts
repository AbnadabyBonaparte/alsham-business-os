/**
 * Tipos puros do Módulo 84 — Créditos de Compensação (Creditbalance).
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o crédito de energia
 * (o SCEE/ANEEL) como LANÇAMENTO IMUTÁVEL — a usina injetou excedente e gerou X
 * kWh de crédito, ou compensou Y kWh de consumo. Não há ciclo de vida (é fato
 * consumado), então não há `Status` nem transição neste módulo.
 *
 * ⭐⭐ A DIREÇÃO mora no TIPO (`credit_type`), a "sinal do tipo" do `loyalty`/`cash`
 * re-perguntada para a energia: `quantityKwh` é SEMPRE > 0, e o que soma ou
 * subtrai é o TIPO (`generated` soma, `consumed` subtrai). Diferente do
 * `loyalty`, a quantidade NÃO é inteira — é kWh, e um crédito de 12,5 kWh é
 * leitura real.
 *
 * @see supabase/migrations/0099_creditbalance.sql
 * @see docs/canon/MODULO-CREDITBALANCE-SPEC.md
 */

/** A direção do movimento: gerar crédito (excedente injetado) ou consumi-lo (compensar). */
export type CreditType = 'generated' | 'consumed';

/** Um lançamento de crédito. Campos carimbados pelo servidor nascem vazios. */
export interface CreditEntry {
  readonly id: string;
  /** A direção: `generated` soma, `consumed` subtrai. O sinal é o TIPO, nunca o número. */
  readonly creditType: CreditType;
  /**
   * A quantidade em kWh do lançamento. SEMPRE `> 0`: não se lança zero nem kWh
   * negativos — o sinal é o `creditType`. NÃO é inteiro (kWh admite fração).
   * Corrigir é lançar o ato inverso, nunca reescrever.
   */
  readonly quantityKwh: number;
  /**
   * A assinatura por ID SOLTO, OPCIONAL: a que unidade o crédito pertence (a
   * chave de conta do saldo), sem FK cruzada. `null` quando ausente — o balcão
   * geral do tenant.
   */
  readonly subscriptionId: string | null;
  /** O nome da assinatura carimbado pela tela. Pode ser vazio. */
  readonly subscriptionName: string;
  /** O motivo TEXTO LIVRE, OPCIONAL ("geração de julho", "compensação — UC 3"). */
  readonly reason: string;
}

/** A entrada crua de um lançamento novo — os campos vêm do formulário. */
export interface NewEntryInput {
  readonly creditType?: unknown;
  readonly quantityKwh?: unknown;
  readonly subscriptionId?: unknown;
  readonly subscriptionName?: unknown;
  readonly reason?: unknown;
}

/**
 * O saldo de uma assinatura — a soma pura do livro (Σ generated − Σ consumed),
 * nunca coluna. Espelha a VIEW `creditbalance.subscription_balances`. O
 * `subscriptionId` `null` é o balcão geral do tenant.
 */
export interface SubscriptionBalance {
  readonly subscriptionId: string | null;
  readonly balanceKwh: number;
  readonly generatedCount: number;
  readonly consumedCount: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
