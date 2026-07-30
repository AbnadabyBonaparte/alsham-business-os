/**
 * @alsham/checklists — Módulo 19: Checklists.
 *
 * Domínio puro. A migration `0034_chk.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './checklists.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
