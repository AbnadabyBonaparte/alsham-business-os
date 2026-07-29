/**
 * `@alsham/deals` — Módulo 10, Funil Comercial.
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI. O que este pacote
 * sabe é como um funil se lê, como o quadro se monta com os estágios DO
 * TENANT e como o forecast pondera valor por probabilidade da mão humana.
 *
 * ⭐ **A Lei das Etapas, segunda aplicação, está aqui pelo que NÃO existe:**
 * nenhum tipo com nome de estágio. E a fronteira com o crm também: o vínculo
 * é `partyId` SOLTO + `partyName` carimbado — este pacote não importa
 * `@alsham/crm`, e não vai importar.
 *
 * ⚠️ Há guarda no CI ("módulo não conhece módulo") que confere isso nos dois
 * sentidos, para os doze módulos.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  canClose,
  isOpen,
  orderedStages,
  buildFunnelBoard,
  weightedCents,
  isPastExpectedClose,
  validateNewOpportunity,
  validateFunnelStages,
  whyCannotLose,
  summarizeFunnel,
  activeFunnels,
} from './deal.ts';

export type {
  DealMovementKind,
  Funnel,
  FunnelColumn,
  FunnelId,
  FunnelStage,
  FunnelStatus,
  NewFunnelStage,
  NewOpportunity,
  Opportunity,
  OpportunityId,
  OpportunityMovement,
  OpportunityStatus,
  StageId,
  TenantId,
} from './types.ts';
