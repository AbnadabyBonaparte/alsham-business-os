/**
 * @alsham/whistle — Módulo 77: Canal de Denúncias.
 *
 * Domínio puro. A migration `0092_whistle.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './whistle.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
