/**
 * @alsham/comms — Módulo 24: Comunicados.
 *
 * Domínio puro. A migration `0039_comm.sql` é o chão; este pacote é a
 * regra que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './comms.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
