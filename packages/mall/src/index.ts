/**
 * @alsham/mall — Módulo 38: Gestão de Lojistas (Vertical Shopping Centers).
 *
 * Domínio puro. A migration `0053_mall.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro). Primeiro módulo vertical da campanha.
 */

export * from './types.ts';
export * from './mall.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
