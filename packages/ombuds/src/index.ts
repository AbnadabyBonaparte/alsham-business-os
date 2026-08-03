/**
 * @alsham/ombuds — Módulo 86: Ouvidoria (Lei 13.460).
 *
 * Domínio puro. A migration `0106_ombuds.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './ombuds.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
