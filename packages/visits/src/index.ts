/**
 * @alsham/visits — Módulo 21: Visitas.
 *
 * Domínio puro. A migration `0036_vis.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './visits.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
