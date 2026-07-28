/**
 * Os tipos do Módulo 5 — Contas a Receber.
 *
 * ⭐ **Espelho consciente do Módulo 3.** Os nomes que mudam, mudam porque o
 * papel é outro (`payerName` em vez de `supplierName`); os que ficam, ficam
 * porque a coisa é a mesma (`counterpartyTaxId` é o identificador fiscal de
 * quem está do outro lado, e ele não muda de natureza por estarmos recebendo).
 */

/**
 * O estado de um título a receber.
 *
 * ⚠️ `cancelled` é ESTADO, nunca `delete`. Título apagado é dinheiro que sumiu
 * do registro — e a tabela não tem policy nem GRANT de DELETE.
 */
export type ReceivableStatus = 'open' | 'partially_received' | 'received' | 'cancelled';

/** Um título a receber, já validado. */
export interface Receivable {
  /** A referência do documento no sistema de origem. Opaca para a plataforma. */
  readonly externalRef: string;
  /** ISO `YYYY-MM-DD`. */
  readonly dueDate: string;
  /** Sempre POSITIVO: é o valor a receber. Inteiro em centavos. */
  readonly amountCents: number;
  /**
   * Quanto já entrou.
   *
   * ⭐ **PODE PASSAR de `amountCents`, e é a divergência do módulo.** Ver
   * `0010_ar.sql` §2.1: receber a maior não é erro de ninguém que esteja aqui
   * dentro, e recusar obrigaria o operador a mentir sobre o que entrou.
   */
  readonly receivedAmountCents: number;
  /** ISO 4217, três letras maiúsculas. Sem default — moeda presumida é viés. */
  readonly currency: string;
  /** Quem deve. Opcional: há crédito a receber sem contraparte nomeada. */
  readonly payerName: string | null;
  /** Identificador fiscal da contraparte. Cada país põe o seu. */
  readonly counterpartyTaxId: string | null;
  readonly description: string;
  /** Como se espera receber. TEXTO LIVRE — ver o ANTI-VIÉS em `0010_ar.sql`. */
  readonly settlementMethod: string | null;
  readonly status: ReceivableStatus;
}

/** O que uma tela entrega. Tudo `unknown`: veio de fora. */
export interface NewReceivableInput {
  readonly externalRef?: unknown;
  readonly dueDate?: unknown;
  readonly amountCents?: unknown;
  readonly currency?: unknown;
  readonly payerName?: unknown;
  readonly counterpartyTaxId?: unknown;
  readonly description?: unknown;
  readonly settlementMethod?: unknown;
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
