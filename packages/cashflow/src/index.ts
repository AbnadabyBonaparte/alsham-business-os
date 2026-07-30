/**
 * @alsham/cashflow — Módulo 14: Fluxo de Caixa.
 *
 * Domínio puro. A migration `0029_cash.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './cashflow.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
