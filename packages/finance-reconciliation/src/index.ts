/**
 * `@alsham/finance-reconciliation` — **Módulo 1: Conciliação & Aprovações.**
 *
 * O primeiro módulo de produto sobre o Core, e a prova de que o Lego funciona.
 * Domain `finance` da Taxonomia; Fase 3 do Roadmap (Smart Reconciliation™).
 *
 * O que este pacote é: **contrato + domínio puro.** O manifesto pelo qual o
 * módulo se declara, os tipos do domínio e o motor de sugestão de baixa —
 * lógica determinística, sem I/O, testável sem infraestrutura.
 *
 * O que este pacote **não** é: não tem UI, não abre conexão de banco, não
 * chama rede e não importa nenhum outro módulo. A única dependência é
 * `@alsham/core`, que é contrato de tipos e nem runtime tem.
 *
 * @see docs/canon/MODULO-RECON-SPEC.md
 * @see supabase/migrations/0002_recon.sql
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  suggestMatches,
  scorePair,
  scoreReceivablePair,
  unmatchedLines,
  summarizeStatement,
  normalizeTaxId,
  normalizeText,
  daysBetween,
} from './matching.ts';

export type { StatementSummary } from './matching.ts';

export type {
  ApprovalItem,
  ApprovalStatus,
  ApprovalSubjectType,
  BankStatement,
  Cents,
  CurrencyCode,
  IsoDate,
  MatchOrigin,
  MatchStatus,
  MatchSuggestion,
  MatchingSettings,
  Payable,
  PayableSource,
  PayableStatus,
  Receivable,
  ReceivableSource,
  ReceivableStatus,
  ReconciliationMatch,
  StatementLine,
  StatementLineStatus,
  StatementSourceFormat,
  StatementStatus,
} from './types.ts';
export {
  parseStatement,
  parseOfx,
  parseCsv,
  splitCsvLine,
  parseAmountToCents,
  parseDate,
  parseOfxDate,
  contentHash,
  StatementParseError,
} from './parsing/index.ts';

export type {
  ColumnRef,
  CsvMapping,
  DateOrder,
  ParsedLine,
  ParsedStatement,
} from './parsing/index.ts';

/**
 * ⭐ O lado que fecha o triângulo: este módulo CONSUMINDO o fato de outro.
 * Ver `external-payable.ts` — e repare que nada aqui importa o produtor.
 */
export {
  CONSUMED_EVENT_TYPES,
  CONSUMED_EVENT_PATTERN,
  CONSUMER_ID,
  toExternalPayable,
  handleExternalPayable,
} from './external-payable.ts';

export type {
  ExternalPayable,
  ExternalPayablePort,
  HandledOutcome,
  Translation,
} from './external-payable.ts';

/**
 * ⭐ O lado do crédito: este módulo CONSUMINDO `ar.receivable.*`.
 * Ver `external-receivable.ts` — sem importar o produtor.
 */
export {
  RECEIVABLE_CONSUMED_EVENT_TYPES,
  RECEIVABLE_CONSUMED_EVENT_PATTERN,
  RECEIVABLE_CONSUMER_ID,
  toExternalReceivable,
  handleExternalReceivable,
} from './external-receivable.ts';

export type {
  ExternalReceivable,
  ExternalReceivablePort,
  ReceivableHandledOutcome,
  ReceivableTranslation,
} from './external-receivable.ts';
