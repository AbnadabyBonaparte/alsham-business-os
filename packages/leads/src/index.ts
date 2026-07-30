/**
 * @alsham/leads — Módulo 22: Leads.
 *
 * Domínio puro. A migration `0037_lead.sql` é o chão; este pacote é a
 * regra que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './leads.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
