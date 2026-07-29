/**
 * Tipos do Módulo 13 — Contratos.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * Contraparte NEUTRA (`counterpartyName` + `counterpartyTaxId`, os nomes dos
 * irmãos) e vínculo com o crm por ID SOLTO (`partyId`) — nunca FK. O termo
 * VIGENTE não é campo do contrato: é o documento original + o último ato de
 * cada livro (reajustes, renovações), calculado por função.
 *
 * @see supabase/migrations/0028_ctr.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-CTR-SPEC.md — o fluxo de negócio
 */

/**
 * O estado de um contrato.
 *
 * ⭐ Os três fins são TERMINAIS. `ended` é o fim NATURAL do prazo (registro
 * de calendário); `terminated` é a rescisão (ato com razão). O contrato que
 * continua é RENOVAÇÃO — ato no mesmo documento; o que recomeça é documento
 * novo.
 */
export type ContractStatus = 'draft' | 'active' | 'ended' | 'terminated' | 'cancelled';

export interface Contract {
  readonly externalRef: string;
  readonly title: string;
  readonly description: string;
  /** TEXTO LIVRE opcional — "locação", "prestação"… vocabulário da casa. */
  readonly contractType: string | null;
  readonly counterpartyName: string | null;
  readonly counterpartyTaxId: string | null;
  /** ⭐ ID SOLTO para o crm — nunca FK. O nome carimbado é o de cima. */
  readonly partyId: string | null;
  /** `AAAA-MM-DD`. Obrigatório para ENTRAR EM VIGOR; rascunho pode não ter. */
  readonly startsOn: string | null;
  /** `AAAA-MM-DD`, opcional SEMPRE: prazo indeterminado existe. ORIGINAL. */
  readonly endsOn: string | null;
  /** Valor ORIGINAL em cents, opcional — e sempre junto da moeda. */
  readonly valueCents: number | null;
  readonly currency: string | null;
  readonly status: ContractStatus;
  readonly outcomeReason: string;
  /** O carimbo do desfecho — do SERVIDOR, nunca da tela. */
  readonly decidedAt: string | null;
}

/** ⭐ Um reajuste REGISTRADO — imutável. O sistema não calcula índice. */
export interface Adjustment {
  readonly id: string;
  readonly contractId: string;
  /** Quando o reajuste passa a valer (`AAAA-MM-DD`). Aceita passado. */
  readonly adjustedOn: string;
  /** TEXTO LIVRE: "IGP-M", "IPCA", "acordo comercial"… */
  readonly indexName: string;
  readonly previousValueCents: number;
  readonly newValueCents: number;
  readonly note: string;
  readonly registeredAt: string;
}

/** ⭐ Uma renovação — ato imutável que ESTENDE a vigência do MESMO contrato. */
export interface Renewal {
  readonly id: string;
  readonly contractId: string;
  readonly previousEndsOn: string;
  readonly newEndsOn: string;
  readonly note: string;
  readonly renewedAt: string;
}

export interface NewContractInput {
  readonly externalRef?: unknown;
  readonly title?: unknown;
  readonly description?: unknown;
  readonly contractType?: unknown;
  readonly counterpartyName?: unknown;
  readonly counterpartyTaxId?: unknown;
  readonly startsOn?: unknown;
  readonly endsOn?: unknown;
  readonly valueCents?: unknown;
  readonly currency?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
