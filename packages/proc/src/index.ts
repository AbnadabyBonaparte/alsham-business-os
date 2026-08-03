/**
 * `@alsham/proc` — Módulo 88, Protocolo (processo administrativo).
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI. O que este pacote
 * sabe é como um rito se lê, por onde um processo pode andar e como uma decisão
 * formal se profere. Quem grava é o schema `proc`; quem mostra é o portal; quem
 * conta ao mundo é o correio.
 *
 * ⭐ **A Lei das Etapas está aqui pelo que NÃO existe:** não há tipo, enum nem
 * constante com nomes de etapa. A etapa é dado do tenant. É a física do `ops`
 * (Módulo 7), re-perguntada para o processo PÚBLICO.
 *
 * ⭐⭐ **O DIVERGE do `ops`:** o número de protocolo (identidade pública), o
 * interessado (id solto + nome), e a decisão formal TERMINAL — o ato de império
 * não reabre, ao contrário do `done` do `ops`.
 *
 * ⚠️ Este pacote **não importa nenhum outro módulo**, e não vai importar.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  ALLOWED_TRANSITIONS,
  FORMAL_DECISIONS,
  canTransition,
  nextStatuses,
  isInTransit,
  isDecided,
  canDecide,
  orderedStages,
  nextStage,
  stagesBefore,
  isLastStage,
  permissionToAdvance,
  whyCannotAdvance,
  whyCannotSkip,
  buildBoard,
  isOverdue,
  validateNewProcess,
  validateDecision,
  validateStages,
  summarizeProcesses,
} from './proc.ts';

export type {
  Workflow,
  WorkflowId,
  WorkflowStage,
  WorkflowStatus,
  StageId,
  ProcessId,
  TenantId,
  ProcessStatus,
  FormalDecision,
  MovementKind,
  Process,
  ProcessMovement,
  NewProcess,
  NewStage,
  BoardColumn,
} from './types.ts';
