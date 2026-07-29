/**
 * `@alsham/accounts-payable` — Módulo 3, Contas a Pagar.
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI. O que este pacote
 * sabe é o que é um título válido e por onde ele pode andar. Quem grava é o
 * schema `ap`; quem mostra é o portal; quem conta ao mundo é o correio.
 *
 * ⚠️ Este pacote **não importa nenhum outro módulo**, e não vai importar. O
 * módulo que reage aos fatos daqui se acopla ao TIPO DO EVENTO, que é contrato
 * público — não a este código. Há guarda no CI ("módulo não conhece módulo").
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  CONSUMED_EVENT_TYPE as RECON_MATCH_EVENT_TYPE,
  CONSUMER_ID as RECON_MATCH_CONSUMER_ID,
  toReconMatchSettlement,
  handleReconMatchSettlement,
} from './recon-settlement.ts';

export type {
  ReconMatchSettlement,
  ReconMatchSettlementPort,
  ApplyReconMatchEffect,
  SettlementHandledOutcome,
  SettlementTranslation,
} from './recon-settlement.ts';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  nextStatuses,
  statusForSettlement,
  validateNewPayable,
  canCancel,
  isOverdue,
  outstandingCents,
} from './payable.ts';

export type {
  Payable,
  PayableStatus,
  NewPayableInput,
  Problem,
  Validation,
} from './types.ts';
