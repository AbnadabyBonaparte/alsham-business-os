import type { Lead } from '@alsham/leads';

export type LeadRow = Lead;

/**
 * Porta de dados do Módulo 22 — própria (Lei do Lego §5.5.8).
 *
 * Repare no que NÃO existe: criar contraparte no crm ou negócio no deal (os
 * vínculos são carimbados, nunca criados daqui), reciclar lead com desfecho
 * e apagar a fila. A porta não promete o que o schema nega.
 */
export interface LeadPort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadLeads(): Promise<LeadRow[]>;
  createLead(input: {
    name: string;
    contact: string;
    source: string;
    interest: string;
  }): Promise<{ leadId: string }>;
  setStatus(input: {
    leadId: string;
    status: 'new' | 'in_contact' | 'qualified' | 'discarded';
    discardReason?: string;
    partyId?: string | null;
    partyName?: string;
    opportunityId?: string | null;
    opportunityTitle?: string;
  }): Promise<void>;
}
