import type { LeadPort, LeadRow } from './lead-port';

const agora = () => new Date().toISOString();
const horasAtras = (h: number) => new Date(Date.now() - h * 3600000).toISOString();

let seq = 1;

const leads: LeadRow[] = [
  {
    id: 'mock-ld-1',
    name: 'Interessado do stand',
    contact: '(62) 9 9999-0000',
    source: 'stand da feira',
    interest: 'orçamento de reforma',
    assigneeUserId: null,
    status: 'new',
    decidedAt: null,
    discardReason: '',
    partyId: null,
    partyName: '',
    opportunityId: null,
    opportunityTitle: '',
    createdAt: horasAtras(3),
  },
  {
    id: 'mock-ld-2',
    name: 'Indicação da dona Maria',
    contact: '',
    source: 'indicação',
    interest: 'manutenção mensal',
    assigneeUserId: null,
    status: 'in_contact',
    decidedAt: null,
    discardReason: '',
    partyId: null,
    partyName: '',
    opportunityId: null,
    opportunityTitle: '',
    createdAt: horasAtras(30),
  },
];

export function createLeadMockPort(): LeadPort {
  return {
    kind: 'mock',

    async listPermissions() {
      return new Set(['lead.lead.manage', 'lead.lead.decide']);
    },

    async loadLeads() {
      return [...leads];
    },

    async createLead(input) {
      const id = `mock-ld-${(seq += 1)}`;
      leads.push({
        id,
        name: input.name,
        contact: input.contact,
        source: input.source,
        interest: input.interest,
        assigneeUserId: null,
        status: 'new',
        decidedAt: null,
        discardReason: '',
        partyId: null,
        partyName: '',
        opportunityId: null,
        opportunityTitle: '',
        createdAt: agora(),
      });
      return { leadId: id };
    },

    async setStatus(input) {
      const i = leads.findIndex((l) => l.id === input.leadId);
      if (i < 0) throw new Error('lead não encontrado');
      const terminal = input.status === 'qualified' || input.status === 'discarded';
      leads[i] = {
        ...leads[i]!,
        status: input.status,
        decidedAt: terminal ? agora() : null,
        discardReason: input.discardReason ?? '',
        partyId: input.partyId ?? leads[i]!.partyId,
        partyName: input.partyName ?? leads[i]!.partyName,
        opportunityId: input.opportunityId ?? leads[i]!.opportunityId,
        opportunityTitle: input.opportunityTitle ?? leads[i]!.opportunityTitle,
      };
    },
  };
}
