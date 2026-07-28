/**
 * `@alsham/crm` — Módulo 4, Relacionamentos (CRM base).
 *
 * Domínio PURO: nem banco, nem rede, nem relógio, nem UI. O que este pacote
 * sabe é o que é uma contraparte válida, o que é um registro de contato válido,
 * e por onde a contraparte pode andar. Quem grava é o schema `crm`; quem mostra
 * é o portal; quem conta ao mundo é o correio.
 *
 * ⚠️ Este pacote **não importa nenhum outro módulo**, e não vai importar. Há
 * guarda no CI ("módulo não conhece módulo") que confere isso nos dois
 * sentidos, para os quatro módulos.
 */

export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';

export {
  ALLOWED_TRANSITIONS,
  canTransition,
  canArchive,
  canRestore,
  normalizeTags,
  normalizeText,
  matchesQuery,
  summarizeParties,
  validateNewParty,
  validateNewInteraction,
} from './party.ts';

export type { PartySummary } from './party.ts';

export type {
  Party,
  PartyKind,
  PartyStatus,
  Interaction,
  NewPartyInput,
  NewInteractionInput,
  Problem,
  Validation,
} from './types.ts';
