/**
 * @alsham/accred — Módulo 94: Credenciamento & Check-in.
 *
 * Domínio puro. A migration `0109_accred.sql` é o chão; este pacote é a
 * regra que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './accred.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
