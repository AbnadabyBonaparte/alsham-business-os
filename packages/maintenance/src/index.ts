/**
 * @alsham/maintenance — Módulo 17: Manutenção.
 *
 * Domínio puro. A migration `0032_mnt.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './maintenance.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
