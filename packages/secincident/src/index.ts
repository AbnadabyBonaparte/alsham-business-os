/**
 * @alsham/secincident — Módulo 79: Resposta a Incidentes de Segurança.
 *
 * Domínio puro. A migration `0094_secincident.sql` é o chão; este pacote é a
 * regra que as telas consomem (Regra de Ouro §5.3).
 */

export * from './types.ts';
export * from './secincident.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
