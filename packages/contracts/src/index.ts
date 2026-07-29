/**
 * @alsham/contracts — Módulo 13: Contratos.
 *
 * Domínio puro. A migration `0028_ctr.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './contract.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
