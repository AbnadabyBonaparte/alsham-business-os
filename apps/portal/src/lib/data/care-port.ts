import type { CareCategory, CarePriority, Interaction, Ticket } from '@alsham/care';

export interface TicketRow extends Ticket {
  readonly createdAt: string;
}

/**
 * Porta de dados do Módulo 15 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: editar ou apagar interação (a conversa é
 * imutável), apagar caso (fechar é status) e apagar classificação
 * (arquivar é status). A porta não promete o que o schema nega.
 */
export interface CarePort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadTickets(): Promise<TicketRow[]>;
  loadCategories(): Promise<CareCategory[]>;
  loadPriorities(): Promise<CarePriority[]>;
  loadInteractions(): Promise<Interaction[]>;
  createTicket(input: {
    subject: string;
    description: string;
    requesterName: string;
    requesterContact: string | null;
    categoryId: string | null;
    priorityId: string | null;
    dueAt: string | null;
  }): Promise<{ ticketId: string }>;
  setStatus(input: {
    ticketId: string;
    status: Ticket['status'];
    resolutionNote?: string;
  }): Promise<void>;
  recordInteraction(input: {
    ticketId: string;
    body: string;
    channel: string | null;
  }): Promise<void>;
  createCategory(input: { name: string }): Promise<void>;
  createPriority(input: { name: string; position: number }): Promise<void>;
}
