/**
 * @alsham/lease — Módulo 39: Locação de Lojistas (Vertical Shopping Centers).
 *
 * Domínio puro. A migration `0054_lease.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro). NÃO reescreve o ctr: vigência,
 * reajuste, renovação e rescisão são inteiramente do ctr, por id solto.
 */

export * from './types.ts';
export * from './lease.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
