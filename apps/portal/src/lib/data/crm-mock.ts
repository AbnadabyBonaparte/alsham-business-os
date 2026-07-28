import { PERMISSIONS, canTransition } from '@alsham/crm';
import type { Interaction, Party, PartyStatus } from '@alsham/crm';

import { DataPortError } from './port';
import type { CrmPort, InteractionRow, PartyRow } from './crm-port';

/**
 * Adapter MOCKADO do Módulo 4 — a tela se prova sem banco no ar.
 *
 * ⚠️ **Lei anti-viés aplicada aos dados de exemplo, e aqui ela é mais difícil
 * que nos outros três.** Um CRM de demonstração é onde o viés entra vestido de
 * "realismo": basta um nome de empresa real, um segmento, um shopping, um
 * lojista. Aqui as contrapartes são "Contraparte Alfa/Beta/Gama", as etiquetas
 * são genéricas, os identificadores são opacos e os canais são comuns a
 * qualquer país. Nenhum nome de cliente, nenhum CNPJ, nenhum aplicativo de
 * mensagem específico.
 *
 * ⚠️ Este arquivo **não** contém regra de negócio própria. A única lei que
 * aplica é a do pacote, chamando `canTransition()` — um mock que aceita o que
 * o banco recusa faz a demonstração mentir sobre o produto.
 */

/** Data-base fixa: dado de demonstração não pode mudar conforme o dia. */
const HOJE = '2026-07-28';

function contraparte(over: Partial<PartyRow> & { id: string; displayName: string }): PartyRow {
  return {
    kind: 'org',
    taxId: null,
    email: null,
    phone: null,
    tags: [],
    note: '',
    status: 'active',
    createdAt: `${HOJE}T09:00:00.000Z`,
    ...over,
  };
}

const PARTIES: PartyRow[] = [
  contraparte({
    id: 'p-alfa',
    displayName: 'Contraparte Alfa',
    taxId: 'ID-0001',
    email: 'contato@alfa.invalid',
    phone: '+00 0000-0000',
    tags: ['fornecedor', 'recorrente'],
    note: 'Organização com histórico de contato.',
  }),
  contraparte({
    id: 'p-beta',
    kind: 'person',
    displayName: 'Contraparte Beta',
    email: 'beta@exemplo.invalid',
    tags: ['prospecto'],
    note: 'Pessoa, sem identificador fiscal — nem toda contraparte tem um.',
  }),
  contraparte({
    id: 'p-gama',
    displayName: 'Contraparte Gama',
    taxId: 'ID-0003',
    tags: ['parceiro'],
    // ⭐ Arquivada de propósito: é o estado que a tela precisa saber mostrar,
    // e é ele que prova que arquivar não apaga o histórico.
    status: 'archived',
    note: 'Arquivada — continua na lista, com o histórico inteiro.',
  }),
  contraparte({
    id: 'p-delta',
    kind: 'person',
    displayName: 'Contraparte Delta',
    tags: [],
    note: 'Sem etiqueta e sem contato: o mínimo que uma contraparte precisa ter.',
  }),
];

const INTERACTIONS: InteractionRow[] = [
  {
    id: 'i-1',
    partyId: 'p-alfa',
    occurredAt: `${HOJE}T13:30:00.000Z`,
    channel: 'ligação',
    note: 'Alinhamento sobre a próxima entrega.',
    createdAt: `${HOJE}T13:35:00.000Z`,
  },
  {
    id: 'i-2',
    partyId: 'p-alfa',
    occurredAt: '2026-07-14T10:00:00.000Z',
    channel: 'visita',
    note: 'Primeira reunião presencial.',
    createdAt: '2026-07-14T18:00:00.000Z',
  },
  {
    id: 'i-3',
    partyId: 'p-gama',
    occurredAt: '2026-05-02T15:00:00.000Z',
    channel: 'e-mail',
    note: 'Último contato antes de arquivar. O histórico continua aqui.',
    createdAt: '2026-05-02T15:01:00.000Z',
  },
];

export function createCrmMockPort(): CrmPort {
  // Cópia por instância: uma demonstração não contamina a outra.
  const parties = PARTIES.map((p) => ({ ...p }));
  const interactions = INTERACTIONS.map((i) => ({ ...i }));
  let proximo = 1;

  return {
    kind: 'mock',

    async listPermissions() {
      // As três, para a demonstração exercitar a tela inteira. Quem separa
      // cadastrar de arquivar é o papel do tenant, no banco.
      return new Set(Object.values(PERMISSIONS));
    },

    async loadParties() {
      return parties.map((p) => ({ ...p }));
    },

    async loadInteractions(partyId: string) {
      return interactions
        .filter((i) => i.partyId === partyId)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
        .map((i) => ({ ...i }));
    },

    async createParty(party: Party) {
      if (party.taxId !== null && parties.some((p) => p.taxId === party.taxId)) {
        // O banco tem índice único parcial por `(tenant_id, tax_id)`. O mock
        // recusa igual, com a mesma mensagem: demonstração que aceita o que
        // produção recusa ensina o operador errado.
        throw new DataPortError(`Já existe uma contraparte com o identificador ${party.taxId}.`);
      }
      const id = `p-novo-${proximo++}`;
      parties.unshift({ ...party, id, createdAt: `${HOJE}T12:00:00.000Z` });
      return { partyId: id };
    },

    async updateParty({ partyId, party }: { partyId: string; party: Party }) {
      const alvo = parties.find((p) => p.id === partyId);
      if (!alvo) throw new DataPortError('Contraparte não encontrada.');
      if (
        party.taxId !== null &&
        parties.some((p) => p.taxId === party.taxId && p.id !== partyId)
      ) {
        throw new DataPortError(`Já existe uma contraparte com o identificador ${party.taxId}.`);
      }
      Object.assign(alvo, party, { id: alvo.id, createdAt: alvo.createdAt, status: alvo.status });
    },

    async updateStatus({ partyId, status }: { partyId: string; status: PartyStatus }) {
      const alvo = parties.find((p) => p.id === partyId);
      if (!alvo) throw new DataPortError('Contraparte não encontrada.');
      if (!canTransition(alvo.status, status)) {
        throw new DataPortError(`Uma contraparte ${alvo.status} não pode passar para ${status}.`);
      }
      alvo.status = status;
    },

    async recordInteraction(interaction: Interaction) {
      if (!parties.some((p) => p.id === interaction.partyId)) {
        throw new DataPortError('Contraparte não encontrada.');
      }
      const id = `i-novo-${proximo++}`;
      interactions.unshift({ ...interaction, id, createdAt: `${HOJE}T12:00:00.000Z` });
      return { interactionId: id };
    },
  };
}
