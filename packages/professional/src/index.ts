/**
 * @alsham/professional — Módulo 98: Profissionais (Vertical Beleza).
 *
 * Domínio puro. A migration `0113_professional.sql` é o chão; este pacote é a
 * regra que as telas consomem (Regra de Ouro). NÃO reescreve o hr — o vínculo
 * de colaborador é por id solto.
 */

export * from './types.ts';
export * from './professional.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
