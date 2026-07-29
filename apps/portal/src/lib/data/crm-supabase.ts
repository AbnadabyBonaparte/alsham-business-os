import type { SupabaseClient } from '@supabase/supabase-js';

import type { Interaction, Party, PartyKind, PartyStatus } from '@alsham/crm';

import { DataPortError } from './port';
import type { CrmPort, InteractionRow, PartyRow } from './crm-port';

/**
 * Adapter REAL do Módulo 4 — fala com o Supabase **como o usuário**, sob RLS.
 *
 * ⛔ **A `service_role key` não aparece neste arquivo, e não pode aparecer.**
 *
 * ⛔ **Não existe `update` nem `delete` em `crm.interactions` aqui**, e não é
 * zelo: aquela tabela não tem policy de UPDATE, não tem GRANT de UPDATE nem de
 * DELETE, e tem um trigger que levanta erro. Se este arquivo tentasse editar
 * uma interação, seria negado três vezes — e é assim que se quer.
 *
 * ⚠️ Zero regra de negócio. Traduz linha de banco em tipo do domínio e volta.
 *
 * ⚠️ **O schema `crm` precisa estar EXPOSTO na Data API do Supabase** para este
 * arquivo funcionar — lição paga na Etapa 9 com o `marketing` e repetida na 10
 * com o `ap`. Está no runbook (§9.0).
 *
 * O `tenantId` chega resolvido da sessão (`lib/session.ts`) — nunca da URL.
 */

const CRM = 'crm';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface PartyDbRow {
  id: string;
  kind: PartyKind;
  display_name: string;
  tax_id: string | null;
  email: string | null;
  phone: string | null;
  tags: string[] | null;
  note: string | null;
  status: PartyStatus;
  created_at: string;
}

function toParty(r: PartyDbRow): PartyRow {
  return {
    id: r.id,
    kind: r.kind,
    displayName: r.display_name,
    taxId: r.tax_id,
    email: r.email,
    phone: r.phone,
    tags: r.tags ?? [],
    note: r.note ?? '',
    status: r.status,
    createdAt: r.created_at,
  };
}

/**
 * As duas violações que o banco recusa e que o operador precisa entender.
 *
 * `23505` é o índice único parcial do identificador; `42501` é o trigger de
 * permissão. Mensagem própria para cada: são coisas diferentes, e o operador
 * resolve cada uma de um jeito. Sem isto, as duas virariam "erro inesperado".
 */
function traduzErro(error: unknown, oQue: string): never {
  const code = (error as { code?: string }).code;
  if (code === '23505') {
    throw new DataPortError(
      'Já existe uma contraparte com esse identificador fiscal neste tenant.',
      { cause: error },
    );
  }
  if (code === '42501') {
    throw new DataPortError(
      'Você não tem a permissão crm.party.archive para mudar o estado desta contraparte.',
      { cause: error },
    );
  }
  if (code === '22023') {
    throw new DataPortError('Esta mudança de estado não existe no ciclo de vida.', { cause: error });
  }
  fail(oQue, error);
}

interface InteractionDbRow {
  id: string;
  party_id: string;
  occurred_at: string;
  channel: string;
  note: string | null;
  created_at: string;
}

/**
 * O tradutor da interação — extraído para o topo quando o carregamento em lote
 * nasceu. Duas cópias do mesmo `snake_case → camelCase` são duas chances de o
 * dia em que a coluna mudar consertar só uma delas.
 */
function toInteraction(r: InteractionDbRow): InteractionRow {
  return {
    id: r.id,
    partyId: r.party_id,
    occurredAt: r.occurred_at,
    channel: r.channel,
    note: r.note ?? '',
    createdAt: r.created_at,
  };
}

export function createCrmSupabasePort(db: SupabaseClient, tenantId: string): CrmPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'crm.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r) => r.permission_key as string));
    },

    async loadParties() {
      const { data, error } = await db
        .schema(CRM)
        .from('parties')
        .select('id, kind, display_name, tax_id, email, phone, tags, note, status, created_at')
        .order('display_name', { ascending: true })
        .limit(500);
      if (error) fail('carregar as contrapartes', error);
      return (data ?? []).map((r) => toParty(r as unknown as PartyDbRow));
    },

    async loadInteractions(partyId: string) {
      const { data, error } = await db
        .schema(CRM)
        .from('interactions')
        .select('id, party_id, occurred_at, channel, note, created_at')
        .eq('party_id', partyId)
        .order('occurred_at', { ascending: false })
        .limit(200);
      if (error) fail('carregar o histórico de contato', error);
      return (data ?? []).map((r) => toInteraction(r as unknown as InteractionDbRow));
    },

    async loadInteractionsFor(partyIds: readonly string[]) {
      // Mapa pré-preenchido com TODAS as contrapartes pedidas: quem não tem
      // contato precisa aparecer com lista vazia, e não sumir do resultado.
      const porContraparte: Record<string, InteractionRow[]> = Object.fromEntries(
        partyIds.map((id) => [id, [] as InteractionRow[]]),
      );
      if (partyIds.length === 0) return porContraparte;

      const { data, error } = await db
        .schema(CRM)
        .from('interactions')
        .select('id, party_id, occurred_at, channel, note, created_at')
        .in('party_id', [...partyIds])
        .order('occurred_at', { ascending: false })
        // ⚠️ Teto do CONJUNTO, não por contraparte. Com 500 contrapartes na
        // porta, um teto por contraparte aqui seria um teto que não existe.
        .limit(2000);
      if (error) fail('carregar o histórico de contato', error);

      for (const r of data ?? []) {
        const row = r as unknown as InteractionDbRow;
        const lista = porContraparte[row.party_id];
        if (lista !== undefined) lista.push(toInteraction(row));
      }
      return porContraparte;
    },

    async createParty(party: Party) {
      const { data, error } = await db
        .schema(CRM)
        .from('parties')
        .insert({
          tenant_id: tenantId,
          kind: party.kind,
          display_name: party.displayName,
          tax_id: party.taxId,
          email: party.email,
          phone: party.phone,
          tags: party.tags,
          note: party.note,
          status: party.status,
        })
        .select('id')
        .single();
      if (error) traduzErro(error, 'cadastrar a contraparte');
      return { partyId: (data as { id: string }).id };
    },

    async updateParty({ partyId, party }) {
      const { error } = await db
        .schema(CRM)
        .from('parties')
        .update({
          kind: party.kind,
          display_name: party.displayName,
          tax_id: party.taxId,
          email: party.email,
          phone: party.phone,
          tags: party.tags,
          note: party.note,
          // ⛔ `status` NÃO entra aqui. Editar cadastro e mudar de estado são
          // atos diferentes, com permissões diferentes — e mandar o estado
          // junto faria o trigger de permissão disparar em toda edição.
        })
        .eq('id', partyId)
        // Cinto: o `tenant_id` da sessão também no WHERE. A RLS já barraria,
        // mas errar em silêncio numa linha de outro tenant é o tipo de bug que
        // ninguém vê acontecer.
        .eq('tenant_id', tenantId);
      if (error) traduzErro(error, 'atualizar a contraparte');
    },

    async updateStatus(input) {
      const { error } = await db
        .schema(CRM)
        .from('parties')
        .update({ status: input.status })
        .eq('id', input.partyId)
        .eq('tenant_id', tenantId);
      if (error) traduzErro(error, 'mudar o estado da contraparte');
    },

    async recordInteraction(interaction: Interaction) {
      const { data, error } = await db
        .schema(CRM)
        .from('interactions')
        .insert({
          tenant_id: tenantId,
          party_id: interaction.partyId,
          occurred_at: interaction.occurredAt,
          channel: interaction.channel,
          note: interaction.note,
        })
        .select('id')
        .single();
      if (error) fail('registrar o contato', error);
      return { interactionId: (data as { id: string }).id };
    },
  };
}
