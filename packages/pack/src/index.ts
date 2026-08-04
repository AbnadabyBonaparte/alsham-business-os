/**
 * @alsham/pack — Módulo 100: Pacotes (Vertical Beleza).
 *
 * ⭐⭐ A peça que fecha a campanha "rumo aos 100 módulos".
 *
 * Domínio puro. A migration `0115_pack.sql` é o chão; este pacote é a regra que
 * as telas consomem (Regra de Ouro). O pacote fechado de sessões — a física do
 * loyalty/invest (saldo é cálculo, consumo > saldo é recusado), com o DIVERGE:
 * o pacote é amarrado a UM serviço e UM cliente, não uma carteira fungível.
 */

export * from './types.ts';
export * from './pack.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
