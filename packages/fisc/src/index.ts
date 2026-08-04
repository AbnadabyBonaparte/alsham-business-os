/**
 * @alsham/fisc — Módulo 85: Fiscalização (Vertical Governo).
 *
 * Domínio puro. A migration `0108_fisc.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro). É a física do `sec` (roster + livro
 * imutável) aplicada à fiscalização municipal — a vistoria CONSTATA; o auto de
 * infração é FORA (Lei 3).
 */

export * from './types.ts';
export * from './fisc.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
