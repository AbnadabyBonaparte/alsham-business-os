/**
 * @alsham/sponsor — Módulo 96: Patrocínios (Vertical Eventos).
 *
 * Domínio puro. A migration `0111_sponsor.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro). NÃO reescreve o ctr (contrato), o
 * deal (negociação) nem o evt (evento) — os três por id solto.
 */

export * from './types.ts';
export * from './sponsor.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
