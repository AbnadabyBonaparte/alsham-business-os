import type { CareCategory, CarePriority, Interaction } from '@alsham/care';

import type { CarePort, TicketRow } from './care-port';

const agora = () => new Date().toISOString();

let seq = 1;

const categories: CareCategory[] = [
  { id: 'mock-cc-1', name: 'troca e devolução', status: 'active' },
  { id: 'mock-cc-2', name: 'dúvida', status: 'active' },
];

const priorities: CarePriority[] = [
  { id: 'mock-cp-1', name: 'urgente', position: 0, status: 'active' },
  { id: 'mock-cp-2', name: 'normal', position: 1, status: 'active' },
];

const tickets: TicketRow[] = [
  {
    id: 'mock-tk-1',
    subject: 'Produto chegou avariado',
    description: 'Embalagem violada na entrega.',
    requesterName: 'Cliente Demo',
    requesterContact: '(62) 90000-0000',
    partyId: null,
    categoryId: 'mock-cc-1',
    priorityId: 'mock-cp-1',
    assigneeUserId: null,
    dueAt: new Date(Date.now() - 86400000).toISOString(),
    status: 'open',
    resolvedAt: null,
    resolutionNote: '',
    createdAt: agora(),
  },
  {
    id: 'mock-tk-2',
    subject: 'Dúvida sobre garantia',
    description: '',
    requesterName: 'Visitante Demo',
    requesterContact: 'balcão',
    partyId: null,
    categoryId: 'mock-cc-2',
    priorityId: 'mock-cp-2',
    assigneeUserId: null,
    dueAt: null,
    status: 'in_progress',
    resolvedAt: null,
    resolutionNote: '',
    createdAt: agora(),
  },
];

const interactions: Interaction[] = [
  {
    id: 'mock-int-1',
    ticketId: 'mock-tk-2',
    body: 'Explicada a cobertura de 90 dias; cliente vai trazer a nota.',
    channel: 'balcão',
    occurredAt: agora(),
  },
];

export function createCareMockPort(): CarePort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['care.ticket.manage', 'care.ticket.resolve', 'care.setup.manage']);
    },

    async loadTickets() {
      return [...tickets];
    },

    async loadCategories() {
      return [...categories];
    },

    async loadPriorities() {
      return [...priorities];
    },

    async loadInteractions() {
      return [...interactions];
    },

    async createTicket(input) {
      const id = `mock-tk-${(seq += 1)}`;
      tickets.unshift({
        id,
        subject: input.subject,
        description: input.description,
        requesterName: input.requesterName,
        requesterContact: input.requesterContact,
        partyId: null,
        categoryId: input.categoryId,
        priorityId: input.priorityId,
        assigneeUserId: null,
        dueAt: input.dueAt,
        status: 'open',
        resolvedAt: null,
        resolutionNote: '',
        createdAt: agora(),
      });
      return { ticketId: id };
    },

    async setStatus(input) {
      const i = tickets.findIndex((t) => t.id === input.ticketId);
      if (i < 0) throw new Error('caso não encontrado');
      const t = tickets[i]!;
      const resolvido = input.status === 'resolved' || input.status === 'closed';
      tickets[i] = {
        ...t,
        status: input.status,
        resolvedAt: resolvido ? agora() : input.status === 'open' ? null : t.resolvedAt,
        resolutionNote: resolvido
          ? (input.resolutionNote ?? t.resolutionNote)
          : input.status === 'open'
            ? ''
            : t.resolutionNote,
      };
    },

    async recordInteraction(input) {
      interactions.push({
        id: `mock-int-${(seq += 1)}`,
        ticketId: input.ticketId,
        body: input.body,
        channel: input.channel,
        occurredAt: agora(),
      });
    },

    async createCategory(input) {
      categories.push({ id: `mock-cc-${(seq += 1)}`, name: input.name, status: 'active' });
    },

    async createPriority(input) {
      priorities.push({
        id: `mock-cp-${(seq += 1)}`,
        name: input.name,
        position: input.position,
        status: 'active',
      });
    },
  };
}
