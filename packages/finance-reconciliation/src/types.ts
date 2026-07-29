import type { IsoDateTime, TenantId, Uuid } from '@alsham/core';

/**
 * Tipos do domínio Conciliação & Aprovações.
 *
 * Espelham `supabase/migrations/0002_recon.sql`. Se um dos dois mudar, o
 * outro muda no mesmo PR — schema e tipo divergentes é como um contrato
 * vira mentira em silêncio.
 */

/** Data-calendário, `YYYY-MM-DD`. Sem hora: extrato é dia, não instante. */
export type IsoDate = string;

/** Moeda em ISO 4217. Sem valor padrão de propósito — presumir moeda é viés de país. */
export type CurrencyCode = string;

/**
 * Valor monetário em centavos, sempre inteiro.
 *
 * Nunca `number` com casa decimal: ponto flutuante em dinheiro é erro
 * garantido, só não se sabe quando aparece.
 */
export type Cents = number;

// -----------------------------------------------------------------------------
// EXTRATO
// -----------------------------------------------------------------------------

/** Formatos de importação aceitos — todos padrões ABERTOS. */
export type StatementSourceFormat = 'ofx' | 'csv' | 'camt053' | 'manual';

export type StatementStatus = 'imported' | 'reconciling' | 'closed' | 'discarded';

/**
 * Um extrato importado.
 *
 * **Anti-viés:** `accountRef` é texto opaco, a referência que o tenant dá à
 * própria conta. A capacidade *Bancos* é outra peça do Domain Financeiro —
 * este módulo não a possui e não a inventa. E não existe lista de bancos
 * homologados: o layout do CSV de um banco específico é
 * `settings.import.csvMapping`, não schema.
 */
export interface BankStatement {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly accountRef: string;
  readonly sourceFormat: StatementSourceFormat;
  readonly originalFilename?: string | null;
  /** Impede reimportar o mesmo extrato duas vezes. */
  readonly contentHash: string;
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
  readonly openingBalanceCents?: Cents | null;
  readonly closingBalanceCents?: Cents | null;
  readonly currency: CurrencyCode;
  readonly status: StatementStatus;
  readonly importedAt: IsoDateTime;
}

export type StatementLineStatus = 'unmatched' | 'suggested' | 'matched' | 'ignored';

/**
 * Uma linha do extrato.
 *
 * **Anti-viés:** `counterpartyTaxId` tem nome neutro de propósito. Chamar de
 * `cnpj` amarraria o produto ao Brasil; o campo é "identificador fiscal da
 * contraparte", e cada país põe o seu.
 */
export interface StatementLine {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly statementId: Uuid;
  readonly lineNo: number;
  readonly postedAt: IsoDate;
  readonly valueDate?: IsoDate | null;
  /** Negativo = saída (débito). Positivo = entrada (crédito). */
  readonly amountCents: Cents;
  readonly currency: CurrencyCode;
  readonly description: string;
  readonly counterpartyName?: string | null;
  readonly counterpartyTaxId?: string | null;
  /** Id da linha no sistema de origem — FITID do OFX, por exemplo. */
  readonly externalId?: string | null;
  readonly balanceAfterCents?: Cents | null;
  readonly status: StatementLineStatus;
}

// -----------------------------------------------------------------------------
// CONTAS A PAGAR — projeção local, não fonte da verdade
// -----------------------------------------------------------------------------

/**
 * De onde veio o título.
 *
 * `imported` — não há módulo de Contas a Pagar instalado; o tenant importa.
 * `event`    — um módulo AP existe e emitiu o fato; este módulo guardou a
 *              própria cópia.
 *
 * Em nenhum dos dois casos este módulo lê a tabela de outro.
 */
export type PayableSource = 'imported' | 'event';

export type PayableStatus = 'open' | 'partially_settled' | 'settled' | 'cancelled';

/**
 * Um título a pagar — **projeção local**.
 *
 * *Contas a pagar* é capacidade própria do Domain Financeiro, de um futuro
 * módulo AP. Se este módulo fosse o dono dela, deixaria de ser o módulo de
 * conciliação e viraria meio ERP. Aqui existe só a cópia necessária para
 * conciliar, alimentada por importação ou por evento.
 */
export interface Payable {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly source: PayableSource;
  /** Quem emitiu, quando `source === 'event'`. */
  readonly sourceModuleId?: string | null;
  /** O identificador do título no sistema de origem. */
  readonly externalRef: string;
  readonly dueDate: IsoDate;
  /** Sempre positivo: é o valor devido. O sinal é da linha do extrato. */
  readonly amountCents: Cents;
  readonly settledAmountCents: Cents;
  readonly currency: CurrencyCode;
  readonly supplierName?: string | null;
  readonly supplierTaxId?: string | null;
  readonly description: string;
  readonly status: PayableStatus;
}

// -----------------------------------------------------------------------------
// CONTAS A RECEBER — projeção local (espelho consciente do payable)
// -----------------------------------------------------------------------------

export type ReceivableSource = 'imported' | 'event';

/**
 * Estados alinhados ao módulo AR (`partially_received` / `received`), não ao
 * vocabulário de pagamento. Um título a receber **não é** um payable com sinal
 * invertido — a divergência "receber a maior" vive aqui (`receivedAmountCents`
 * pode passar de `amountCents`).
 */
export type ReceivableStatus =
  | 'open'
  | 'partially_received'
  | 'received'
  | 'cancelled';

export interface Receivable {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly source: ReceivableSource;
  readonly sourceModuleId?: string | null;
  readonly externalRef: string;
  readonly dueDate: IsoDate;
  /** Sempre positivo: é o valor a receber. O sinal é da linha do extrato. */
  readonly amountCents: Cents;
  /**
   * Quanto já entrou. **Pode passar de `amountCents`** — receber a maior é
   * permitido (MODULO-AR-SPEC). O motor de casamento trata saldo restante
   * como `max(0, amount - received)`.
   */
  readonly receivedAmountCents: Cents;
  readonly currency: CurrencyCode;
  readonly counterpartyName?: string | null;
  readonly counterpartyTaxId?: string | null;
  readonly description: string;
  readonly status: ReceivableStatus;
}

// -----------------------------------------------------------------------------
// CASAMENTO
// -----------------------------------------------------------------------------

/** Procedência do casamento. Humano não tem score — humano tem responsabilidade. */
export type MatchOrigin = 'auto' | 'manual';

export type MatchStatus = 'suggested' | 'confirmed' | 'rejected';

/**
 * Casamento persistido — polimórfico: exatamente um de `payableId` /
 * `receivableId` (CHECK no schema `0011`).
 */
export interface ReconciliationMatch {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly statementLineId: Uuid;
  readonly payableId?: Uuid | null;
  readonly receivableId?: Uuid | null;
  readonly matchedAmountCents: Cents;
  /** Confiança de 0 a 1. `null` quando `origin === 'manual'`. */
  readonly score?: number | null;
  readonly origin: MatchOrigin;
  /** O nome da regra que casou. Guardar QUAL regra funcionou é o que permite aprender depois. */
  readonly strategy?: string | null;
  readonly status: MatchStatus;
  readonly decidedAt?: IsoDateTime | null;
  readonly decidedBy?: Uuid | null;
}

// -----------------------------------------------------------------------------
// APROVAÇÃO
// -----------------------------------------------------------------------------

export type ApprovalSubjectType = 'reconciliation-match' | 'statement-closure';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

/**
 * Um item da fila que substitui a mesa do diretor.
 *
 * **Anti-viés — a decisão mais importante do módulo:** este tipo guarda o
 * **registro da decisão**, nunca a **política de aprovação**. "Acima de X,
 * dois diretores", "quem lança não aprova", alçada por valor — tudo isso é
 * `settings.approval.*`. Se virasse tipo, teríamos modelado o organograma de
 * uma empresa dentro do produto.
 */
export interface ApprovalItem {
  readonly id: Uuid;
  readonly tenantId: TenantId;
  readonly subjectType: ApprovalSubjectType;
  readonly subjectId: Uuid;
  readonly title: string;
  readonly amountCents?: Cents | null;
  readonly currency?: CurrencyCode | null;
  readonly status: ApprovalStatus;
  readonly requestedAt: IsoDateTime;
  readonly requestedBy?: Uuid | null;
  readonly decidedAt?: IsoDateTime | null;
  readonly decidedBy?: Uuid | null;
  readonly decisionNote?: string | null;
}

// -----------------------------------------------------------------------------
// CONFIGURAÇÃO DO TENANT — onde a Lei anti-viés vive
// -----------------------------------------------------------------------------

/**
 * Os parâmetros de conciliação **do tenant**.
 *
 * Isto não é schema e não é constante: vem de
 * `core.tenant_modules.settings`. É deliberado — uma empresa aceita casar
 * automático a 0.95, outra exige 0.99, outra não aceita nada sem humano
 * olhar. Se qualquer um destes números virasse literal no código ou coluna
 * na tabela, o produto seria o sistema de UMA empresa.
 *
 * Por isso `suggestMatches()` recebe estes valores como parâmetro e não tem
 * default embutido: a função não decide política, ela aplica a do tenant.
 */
export interface MatchingSettings {
  /** Diferença de valor tolerada, em centavos. `0` = exige valor exato. */
  readonly amountToleranceCents: Cents;
  /** Distância tolerada entre data do lançamento e vencimento, em dias. */
  readonly dateToleranceDays: number;
  /** Score mínimo para virar sugestão. Abaixo disso, nem se mostra. */
  readonly minScore: number;
}

/**
 * Uma sugestão de casamento produzida pelo motor. Nada aqui foi gravado ainda.
 *
 * ⭐ União discriminada: débito casa com payable; crédito casa com receivable.
 * Um campo `payableId` só mentiria sobre metade dos casamentos.
 */
export type MatchSuggestion =
  | {
      readonly kind: 'payable';
      readonly statementLineId: Uuid;
      readonly payableId: Uuid;
      readonly matchedAmountCents: Cents;
      /** 0 a 1, com 4 casas. */
      readonly score: number;
      /** Os sinais que dispararam, em ordem estável. @example 'amount+date+tax-id' */
      readonly strategy: string;
    }
  | {
      readonly kind: 'receivable';
      readonly statementLineId: Uuid;
      readonly receivableId: Uuid;
      readonly matchedAmountCents: Cents;
      readonly score: number;
      readonly strategy: string;
    };
