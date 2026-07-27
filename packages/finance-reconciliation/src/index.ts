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
  unmatchedLines,
  normalizeTaxId,
  normalizeText,
  daysBetween,
} from './matching.ts';

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
  ReconciliationMatch,
  StatementLine,
  StatementLineStatus,
  StatementSourceFormat,
  StatementStatus,
} from './types.ts';
