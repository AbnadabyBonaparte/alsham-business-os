/**
 * `@alsham/investments` — Módulo 31, Investimentos.
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI. O que este pacote
 * sabe é o ciclo de vida do investimento (volta do arquivo), a posição do
 * livro (sem cotação) e a terceira resposta: resgatar mais que a posição é
 * recusado. Quem grava é o schema `invest`; o teto do resgate é o gatilho.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  canArchive,
  canRestore,
  positionOf,
  canRedeem,
  orderHoldings,
  validateNewHolding,
  validateMovement,
} from './investments.ts';

export type { NewHoldingInput, NewMovementInput } from './investments.ts';

export type {
  HoldingStatus,
  Holding,
  Movement,
  MovementKind,
  Position,
  Problem,
  Validation,
} from './types.ts';
