/**
 * `@alsham/budgets` — Módulo 29, Orçamentos.
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI. O que este pacote
 * sabe é o ciclo de vida do orçamento (rascunho → ativo → fechado, a trave
 * que congela na ativação), como se calcula o saldo, e como um lançamento
 * de caixa alheio vira projeção local. Quem grava é o schema `bud`; quem
 * entrega os fatos é o correio, pela composição.
 *
 * ⭐ Este é o quinto consumidor do repositório (recon, marketing, ar, dun,
 * e agora bud) e obedece à mesma lei: consome o TIPO do evento, nunca o
 * módulo — não importa `@alsham/cashflow`, não lê o schema dele, e a origem
 * vem de `envelope.producedBy`. Há guarda no CI para as três formas de
 * trair isso.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  canActivate,
  canClose,
  canEditTrave,
  remaining,
  usedPercent,
  isOverBudget,
  orderBudgets,
  validateNewBudget,
} from './budgets.ts';

export {
  CONSUMED_EVENT_TYPES,
  CONSUMED_EVENT_PATTERN,
  CONSUMER_ID,
  toBudMovement,
  handleBudMovement,
} from './realized.ts';

export type {
  BudMovement,
  MovementTranslation,
  BudMovementPort,
  MovementHandledOutcome,
} from './realized.ts';

export type { NewBudgetInput } from './budgets.ts';

export type { Budget, BudgetStatus, BudgetRealized, Problem, Validation } from './types.ts';
