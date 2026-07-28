/**
 * Os tipos do Módulo 3 — Contas a Pagar.
 *
 * Nomes NEUTROS de país, de propósito e pela mesma razão do Módulo 1: o
 * identificador fiscal se chama `counterpartyTaxId`, não `cnpj`. Chamar de CNPJ
 * amarraria o produto ao Brasil, e este módulo nasce servindo qualquer um.
 */

/**
 * O estado de um título.
 *
 * ⚠️ `cancelled` é ESTADO, nunca `delete`. Título apagado é conta paga sem
 * documento — e a tabela não tem policy de DELETE nem GRANT de DELETE, para
 * que a decisão não dependa de ninguém lembrar dela.
 */
export type PayableStatus = 'open' | 'partially_settled' | 'settled' | 'cancelled';

/** Um título a pagar, já validado. */
export interface Payable {
  /** A referência do documento no sistema de origem. Opaca para a plataforma. */
  readonly externalRef: string;
  /** ISO `YYYY-MM-DD`. */
  readonly dueDate: string;
  /** Sempre POSITIVO: é o valor devido. Inteiro em centavos. */
  readonly amountCents: number;
  /** Quanto já foi liquidado. Nunca maior que `amountCents`. */
  readonly settledAmountCents: number;
  /** ISO 4217, três letras maiúsculas. Sem default — moeda presumida é viés. */
  readonly currency: string;
  readonly supplierName: string | null;
  /** Identificador fiscal da contraparte. Cada país põe o seu. */
  readonly counterpartyTaxId: string | null;
  readonly description: string;
  /** Como se pretende pagar. TEXTO LIVRE — ver o ANTI-VIÉS em `0007_ap.sql`. */
  readonly paymentMethod: string | null;
  readonly status: PayableStatus;
}

/** O que uma tela entrega para registrar um título. Tudo `unknown`: veio de fora. */
export interface NewPayableInput {
  readonly externalRef?: unknown;
  readonly dueDate?: unknown;
  readonly amountCents?: unknown;
  readonly currency?: unknown;
  readonly supplierName?: unknown;
  readonly counterpartyTaxId?: unknown;
  readonly description?: unknown;
  readonly paymentMethod?: unknown;
}

/** Um problema encontrado na validação, já em português e já endereçado. */
export interface Problem {
  /** O campo culpado — para a tela saber onde pintar o erro. */
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
