import type { SupabaseClient } from '@supabase/supabase-js';

import type { Proposal, ProposalStatus } from '@alsham/quotes';

import { DataPortError } from './port';
import type { ProposalRow, QuotePort } from './quote-port';

const QUOTE = 'quote';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface ProposalDb {
  id: string;
  external_ref: string;
  currency: string;
  prospect_name: string | null;
  counterparty_tax_id: string | null;
  description: string | null;
  valid_until: string | null;
  total_cents: number;
  status: ProposalStatus;
  decided_at: string | null;
  decision_note: string;
  created_at: string;
}

interface ItemDb {
  line_no: number;
  description: string;
  quantity: number;
  unit_amount_cents: number;
  line_total_cents: number;
}

export function createQuoteSupabasePort(db: SupabaseClient, tenantId: string): QuotePort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'quote.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadProposals() {
      const { data: proposals, error } = await db
        .schema(QUOTE)
        .from('proposals')
        .select(
          'id, external_ref, currency, prospect_name, counterparty_tax_id, description, valid_until, total_cents, status, decided_at, decision_note, created_at',
        )
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });
      if (error) fail('carregar propostas', error);

      const rows = (proposals ?? []) as ProposalDb[];
      if (rows.length === 0) return [];

      const ids = rows.map((p) => p.id);
      const { data: items, error: itemsErr } = await db
        .schema(QUOTE)
        .from('proposal_items')
        .select('proposal_id, line_no, description, quantity, unit_amount_cents, line_total_cents')
        .in('proposal_id', ids);
      if (itemsErr) fail('carregar itens das propostas', itemsErr);

      const byProposal = new Map<string, ItemDb[]>();
      for (const raw of items ?? []) {
        const r = raw as ItemDb & { proposal_id: string };
        const list = byProposal.get(r.proposal_id) ?? [];
        list.push(r);
        byProposal.set(r.proposal_id, list);
      }

      return rows.map((p): ProposalRow => {
        const its = (byProposal.get(p.id) ?? []).sort((a, b) => a.line_no - b.line_no);
        return {
          id: p.id,
          externalRef: p.external_ref,
          currency: p.currency,
          prospectName: p.prospect_name,
          counterpartyTaxId: p.counterparty_tax_id,
          description: p.description ?? '',
          validUntil: p.valid_until,
          totalCents: Number(p.total_cents),
          status: p.status,
          decidedAt: p.decided_at,
          decisionNote: p.decision_note ?? '',
          createdAt: p.created_at,
          items: its.map((i) => ({
            lineNo: i.line_no,
            description: i.description,
            quantity: Number(i.quantity),
            unitAmountCents: Number(i.unit_amount_cents),
            lineTotalCents: Number(i.line_total_cents),
          })),
        };
      });
    },

    async createProposal(proposal: Proposal) {
      const { data, error } = await db
        .schema(QUOTE)
        .from('proposals')
        .insert({
          tenant_id: tenantId,
          external_ref: proposal.externalRef,
          currency: proposal.currency,
          prospect_name: proposal.prospectName,
          counterparty_tax_id: proposal.counterpartyTaxId,
          description: proposal.description,
          valid_until: proposal.validUntil,
          status: 'draft',
        })
        .select('id')
        .single();
      if (error) fail('registrar a proposta', error);
      const proposalId = (data as { id: string }).id;

      const { error: itemsErr } = await db.schema(QUOTE).from('proposal_items').insert(
        proposal.items.map((i) => ({
          tenant_id: tenantId,
          proposal_id: proposalId,
          line_no: i.lineNo,
          description: i.description,
          quantity: i.quantity,
          unit_amount_cents: i.unitAmountCents,
        })),
      );
      if (itemsErr) fail('registrar os itens da proposta', itemsErr);

      return { proposalId };
    },

    async updateStatus(input: {
      proposalId: string;
      status: ProposalStatus;
      decisionNote?: string;
    }) {
      const patch: Record<string, unknown> = { status: input.status };
      if (input.decisionNote !== undefined) patch.decision_note = input.decisionNote;
      const { error } = await db
        .schema(QUOTE)
        .from('proposals')
        .update(patch)
        .eq('id', input.proposalId)
        .eq('tenant_id', tenantId);
      if (error) fail('mudar o estado da proposta', error);
    },
  };
}
