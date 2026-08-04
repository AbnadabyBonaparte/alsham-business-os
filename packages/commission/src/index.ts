/**
 * @alsham/commission — Módulo 99: Comissões (Vertical Beleza).
 *
 * Domínio puro. A migration `0114_commission.sql` é o chão; este pacote é a
 * regra que as telas consomem (Regra de Ouro). O livro de comissões é
 * IMUTÁVEL, e o módulo NÃO calcula comissão a partir de percentual (Lei 7) — o
 * valor é registrado por quem lança. NÃO reescreve o cadastro de profissional
 * (id solto).
 */

export * from './types.ts';
export * from './commission.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
