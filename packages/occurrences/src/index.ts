/**
 * @alsham/occurrences — Módulo 16: Ocorrências.
 *
 * Domínio puro. A migration `0031_occ.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './occurrence.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
