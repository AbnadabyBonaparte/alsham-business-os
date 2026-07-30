/**
 * @alsham/fund — Módulo 40: Fundo de Promoção (Vertical Shopping Centers).
 *
 * Domínio puro. A migration `0055_fund.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro). Autossuficiente — NÃO importa o
 * `@alsham/cost-centers`.
 */

export * from './types.ts';
export * from './fund.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
