/**
 * `@alsham/quotes` — Módulo 9, Propostas / Orçamentos.
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI. O que este pacote
 * sabe é como uma proposta nasce, por onde o ciclo dela anda e por que os
 * quatro fins são terminais. Quem grava é o schema `quote`; quem mostra é o
 * portal; quem conta ao mundo é o correio.
 *
 * ⭐ **A decisão de canon está no que NÃO existe:** não há transição saindo
 * de `accepted`, `declined`, `expired` ou `cancelled`. A proposta tem
 * identidade por DOCUMENTO — renegociar é documento novo.
 *
 * ⚠️ Este pacote **não importa nenhum outro módulo**, e não vai importar. Há
 * guarda no CI ("módulo não conhece módulo") que confere isso nos dois
 * sentidos, para os doze módulos.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  nextStatuses,
  canSend,
  canDecide,
  canCancel,
  canEditContent,
  isExpirable,
  lineTotalCents,
  sumItems,
  validateNewProposal,
  summarizeProposals,
} from './quote.ts';

export type {
  NewProposalInput,
  NewProposalItemInput,
  Problem,
  Proposal,
  ProposalItem,
  ProposalStatus,
  Validation,
} from './types.ts';
