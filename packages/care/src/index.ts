/**
 * @alsham/care — Módulo 15: Atendimento.
 *
 * Domínio puro. A migration `0030_care.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './care.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
