/**
 * `@alsham/dunning` — Módulo 12, Régua de Cobrança.
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI. O que este pacote
 * sabe é quem está na régua, qual é o próximo passo e como um fato de
 * título alheio vira projeção local. Quem grava é o schema `dun`; quem
 * entrega os fatos é o correio, pela composição.
 *
 * ⭐ Este é o quarto consumidor do repositório, e obedece à mesma lei dos
 * três primeiros: consome o TIPO do evento, nunca o módulo — não importa
 * `@alsham/accounts-receivable`, não lê o schema dele, e a origem vem de
 * `envelope.producedBy`. Há guarda no CI para as três formas de trair isso.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  isInQueue,
  daysOverdue,
  orderedSteps,
  dueSteps,
  nextStep,
  positionOf,
  validateRulerSteps,
  outstandingCentsOf,
  summarizeQueue,
} from './dunning.ts';

export {
  CONSUMED_EVENT_TYPES,
  CONSUMED_EVENT_PATTERN,
  CONSUMER_ID,
  toExternalTitle,
  handleDunTitle,
} from './dun-title.ts';

export type {
  ExternalTitle,
  TitleTranslation,
  DunTitlePort,
  TitleHandledOutcome,
} from './dun-title.ts';

export type {
  DunTitle,
  NewRulerStep,
  Ruler,
  RulerId,
  RulerStatus,
  RulerStep,
  StepExecution,
  StepId,
  TenantId,
  TitleId,
  TitleStatus,
} from './types.ts';
