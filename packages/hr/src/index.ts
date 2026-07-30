/**
 * @alsham/hr — Módulo 33: Cadastro de Colaboradores.
 *
 * Domínio puro. A migration `0048_hr.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro).
 */

export * from './types.ts';
export * from './hr.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
