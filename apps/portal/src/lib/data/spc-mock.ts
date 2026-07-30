import { findConflict } from '@alsham/spaces';
import type { Space } from '@alsham/spaces';

import type { ReservationRow, SpcPort } from './spc-port';

const agora = () => new Date().toISOString();
const horas = (h: number) => new Date(Date.now() + h * 3600000).toISOString();

let seq = 1;

const spaces: Space[] = [
  { id: 'mock-sp-1', name: 'Sala de reunião 1', description: 'TV e quadro branco.', capacity: 8, status: 'active' },
  { id: 'mock-sp-2', name: 'Auditório', description: '', capacity: 60, status: 'active' },
];

const reservations: ReservationRow[] = [
  {
    id: 'mock-rv-1',
    spaceId: 'mock-sp-1',
    purpose: 'reunião de diretoria',
    startsAt: horas(2),
    endsAt: horas(4),
    status: 'booked',
    cancelledAt: null,
    cancelReason: '',
    createdAt: agora(),
  },
];

export function createSpcMockPort(): SpcPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['spc.reservation.manage', 'spc.setup.manage']);
    },

    async loadSpaces() {
      return [...spaces];
    },

    async loadReservations() {
      return [...reservations];
    },

    async createSpace(input) {
      spaces.push({
        id: `mock-sp-${(seq += 1)}`,
        name: input.name,
        description: input.description,
        capacity: input.capacity,
        status: 'active',
      });
    },

    async setSpaceStatus(input) {
      const i = spaces.findIndex((s) => s.id === input.spaceId);
      if (i < 0) throw new Error('espaço não encontrado');
      spaces[i] = { ...spaces[i]!, status: input.status };
    },

    async bookReservation(input) {
      // O mock imita a constraint: o conflito recusa, com a mesma régua.
      const conflito = findConflict(input.spaceId, input.startsAt, input.endsAt, reservations);
      if (conflito !== null) throw new Error('o período cruza com outra reserva');
      const id = `mock-rv-${(seq += 1)}`;
      reservations.unshift({
        id,
        spaceId: input.spaceId,
        purpose: input.purpose,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: 'booked',
        cancelledAt: null,
        cancelReason: '',
        createdAt: agora(),
      });
      return { reservationId: id };
    },

    async cancelReservation(input) {
      const i = reservations.findIndex((r) => r.id === input.reservationId);
      if (i < 0) throw new Error('reserva não encontrada');
      reservations[i] = {
        ...reservations[i]!,
        status: 'cancelled',
        cancelledAt: agora(),
        cancelReason: input.reason,
      };
    },
  };
}
