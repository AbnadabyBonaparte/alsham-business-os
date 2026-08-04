/**
 * @alsham/booking — Módulo 97: Agendamento (Vertical Beleza).
 *
 * Domínio puro. A migration `0112_booking.sql` é o chão; este pacote é a regra
 * que as telas consomem (Regra de Ouro). Reaproveita a física do no-show do
 * `appointment`, mas o cliente é do `crm` por id solto (não paciente, não PHI),
 * o serviço é texto livre e o profissional é id solto ao módulo `professional`.
 */

export * from './types.ts';
export * from './booking.ts';
export { MANIFEST, PERMISSIONS, EVENTS } from './manifest.ts';
