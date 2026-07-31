/**
 * @alsham/cashregister — Módulo 73: Sessão de Caixa (Vertical Varejo &
 * Supermercados).
 *
 * Domínio puro. A migration `0088_cashregister.sql` é o chão; este pacote é a
 * regra que as telas consomem (Regra de Ouro). O turno físico de uma gaveta:
 * abre contando o fundo, fecha contando a gaveta.
 */

export * from './types.ts';
export * from './cashregister.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
