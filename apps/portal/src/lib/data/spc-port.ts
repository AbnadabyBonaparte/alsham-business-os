import type { Reservation, Space } from '@alsham/spaces';

export interface ReservationRow extends Reservation {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 20 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: apagar reserva (cancelar é status, com razão) e
 * checar conflito por consulta — quem recusa o conflito é a EXCLUSION
 * constraint; a porta só entrega a agenda para o pacote avisar antes.
 */
export interface SpcPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadSpaces(): Promise<Space[]>;
  loadReservations(): Promise<ReservationRow[]>;
  createSpace(input: { name: string; description: string; capacity: number | null }): Promise<void>;
  setSpaceStatus(input: { spaceId: string; status: 'active' | 'archived' }): Promise<void>;
  bookReservation(input: {
    spaceId: string;
    purpose: string;
    startsAt: string;
    endsAt: string;
  }): Promise<{ reservationId: string }>;
  cancelReservation(input: { reservationId: string; reason: string }): Promise<void>;
}
