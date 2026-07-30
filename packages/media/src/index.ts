/**
 * @alsham/media — Módulo 26: Biblioteca de Mídia.
 *
 * Domínio puro. A migration `0041_media.sql` é o chão; este pacote é a
 * regra que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './media.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
