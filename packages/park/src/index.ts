/**
 * @alsham/park — Módulo 41: Estacionamento (Vertical Shopping Centers).
 *
 * Domínio puro. A migration `0056_park.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro). A identidade do `vis` (portaria)
 * aplicada ao veículo.
 */

export * from './types.ts';
export * from './park.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
