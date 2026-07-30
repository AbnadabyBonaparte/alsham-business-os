/**
 * `@alsham/bank-accounts` — Módulo 30, Contas Bancárias.
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI. O que este pacote
 * sabe é o ciclo de vida da conta (volta do arquivo), o saldo do livro (que
 * pode ser negativo) e as validações de lançamento e transferência. Quem
 * grava é o schema `bank`; a transferência atômica é a função do banco.
 *
 * ⭐ **SOL ÚNICO:** a conciliação é do `recon`. Este pacote não a conhece.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  canArchive,
  canRestore,
  balanceOf,
  signedAmountCents,
  isOverdrawn,
  orderAccounts,
  validateNewAccount,
  validateMovement,
  validateTransfer,
} from './bank-accounts.ts';

export type { NewAccountInput, NewMovementInput, TransferInput } from './bank-accounts.ts';

export type {
  AccountStatus,
  BankAccount,
  Movement,
  MovementKind,
  AccountBalance,
  Problem,
  Validation,
} from './types.ts';
