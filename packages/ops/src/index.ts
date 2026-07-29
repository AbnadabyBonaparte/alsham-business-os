/**
 * `@alsham/ops` — Módulo 7, Esteira de Produção.
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI. O que este pacote
 * sabe é como uma esteira se lê, por onde uma ordem de serviço pode andar e
 * como um entregável versiona. Quem grava é o schema `ops`; quem mostra é o
 * portal; quem conta ao mundo é o correio.
 *
 * ⭐ **A Lei das Etapas está aqui pelo que NÃO existe:** não há tipo, enum nem
 * constante com nomes de etapa. A etapa é dado do tenant, e o dia em que
 * alguém escrever `type Stage = 'briefing' | ...` neste pacote é o dia em que
 * o produto passa a vender o processo de um cliente para todos.
 *
 * ⚠️ Este pacote **não importa nenhum outro módulo**, e não vai importar. Há
 * guarda no CI ("módulo não conhece módulo") que confere isso nos dois
 * sentidos, para os seis módulos.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  nextStatuses,
  isOnTheLine,
  canCancel,
  canComplete,
  orderedStages,
  nextStage,
  stagesBefore,
  isLastStage,
  permissionToAdvance,
  whyCannotAdvance,
  whyCannotSkip,
  nextVersion,
  latestDeliverables,
  buildBoard,
  isOverdue,
  validateNewOrder,
  validateStages,
  summarizeOrders,
} from './order.ts';

export type {
  Pipeline,
  PipelineId,
  PipelineStage,
  PipelineStatus,
  StageId,
  OrderId,
  TenantId,
  OrderStatus,
  MovementKind,
  WorkOrder,
  OrderMovement,
  Deliverable,
  NewWorkOrder,
  NewStage,
  BoardColumn,
} from './types.ts';
