/**
 * @alsham/policies — Módulo 37: Políticas.
 *
 * Domínio puro. A migration `0052_pol.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './policies.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
