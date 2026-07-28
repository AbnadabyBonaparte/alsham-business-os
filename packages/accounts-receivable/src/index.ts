/**
 * `@alsham/accounts-receivable` — Módulo 5, Contas a Receber.
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐ **Espelho consciente do Módulo 3.** Cada decisão do `accounts-payable` foi
 * re-perguntada aqui, e a resposta está escrita — no `0010_ar.sql` (quadro de
 * MANTIDO × DIVERGE) e em `docs/canon/MODULO-AR-SPEC.md`. Copiar sem pensar e
 * divergir sem escrever são o mesmo erro.
 *
 * ⚠️ Este pacote **não importa nenhum outro módulo**, e não vai importar — nem
 * o `accounts-payable`, apesar de espelhá-lo. Espelhar é escrever a mesma
 * decisão de novo, não compartilhar código: se os dois compartilhassem um
 * `lifecycle` comum, mudar a regra de um mudaria a do outro em silêncio, e a
 * divergência de §2.1 seria impossível de expressar.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  nextStatuses,
  canCancel,
  statusForReceipt,
  outstandingCents,
  overpaidCents,
  isOverdue,
  validateNewReceivable,
  summarizeReceivables,
} from './receivable.ts';

export type { ReceivableSummary } from './receivable.ts';

export type {
  Receivable,
  ReceivableStatus,
  NewReceivableInput,
  Problem,
  Validation,
} from './types.ts';
