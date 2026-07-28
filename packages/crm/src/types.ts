/**
 * Os tipos do Módulo 4 — Relacionamentos (CRM base).
 *
 * Nomes NEUTROS de país, pela mesma razão dos Módulos 1 e 3: o identificador
 * fiscal se chama `taxId`, não `cpf` nem `cnpj`.
 */

/**
 * Pessoa ou organização.
 *
 * ⚠️ **Dois valores, e só dois.** É a distinção que muda o comportamento no
 * mundo real e a única que vale em qualquer país e qualquer setor. "Cliente",
 * "fornecedor", "lead" e "parceiro" NÃO entram aqui — são `tags`, escolhidas
 * pelo tenant. Ver o ANTI-VIÉS em `0009_crm.sql`.
 */
export type PartyKind = 'person' | 'org';

/**
 * O estado de uma contraparte.
 *
 * ⚠️ `archived` é ESTADO, nunca `delete`. Contraparte apagada leva junto o
 * histórico de contato — e a tabela não tem policy nem GRANT de DELETE.
 */
export type PartyStatus = 'active' | 'archived';

/** Uma contraparte, já validada. */
export interface Party {
  readonly kind: PartyKind;
  readonly displayName: string;
  /** Identificador fiscal. Neutro de país, e OPCIONAL. */
  readonly taxId: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  /** O recorte da carteira é do tenant. Sem lista, sem enum. */
  readonly tags: readonly string[];
  readonly note: string;
  readonly status: PartyStatus;
}

/** Um registro de contato, já validado. */
export interface Interaction {
  readonly partyId: string;
  /** Quando ACONTECEU — pode ser no passado. ISO 8601. */
  readonly occurredAt: string;
  /** Por onde. TEXTO LIVRE: instrumento de contato é de um país e de uma década. */
  readonly channel: string;
  readonly note: string;
}

/** O que uma tela entrega. Tudo `unknown`: veio de fora. */
export interface NewPartyInput {
  readonly kind?: unknown;
  readonly displayName?: unknown;
  readonly taxId?: unknown;
  readonly email?: unknown;
  readonly phone?: unknown;
  readonly tags?: unknown;
  readonly note?: unknown;
}

export interface NewInteractionInput {
  readonly partyId?: unknown;
  readonly occurredAt?: unknown;
  readonly channel?: unknown;
  readonly note?: unknown;
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
