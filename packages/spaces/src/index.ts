/**
 * @alsham/spaces — Módulo 20: Reserva de Espaços.
 *
 * Domínio puro. A migration `0035_spc.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './spaces.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
