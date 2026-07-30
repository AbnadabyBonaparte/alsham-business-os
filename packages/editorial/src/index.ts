/**
 * @alsham/editorial — Módulo 25: Calendário Editorial.
 *
 * Domínio puro. A migration `0040_edcal.sql` é o chão; este pacote é a
 * regra que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './editorial.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
