import { DEFAULT_SETTINGS, PERMISSIONS } from '@alsham/marketing';
import type { Campaign, MarketingSettings, SpendApproval } from '@alsham/marketing';

import { DataPortError } from './port';
import type { MarketingPort } from './marketing-port';

/**
 * Adapter MOCKADO do Módulo 2 — a tela se prova sem banco no ar.
 *
 * ⚠️ **Lei anti-viés aplicada aos dados de exemplo.** As campanhas são
 * "Campanha Alfa", "Beta", "Gama" e os canais são genéricos. Nenhum nome de
 * empresa, produto, sazonalidade ou praça — nem aqui, nem em fixture, nem em
 * comentário. Escrever "Campanha de Dia das Mães do shopping" seria o viés
 * entrando pela porta dos fundos, que é por onde ele costuma entrar.
 *
 * ⚠️ Este arquivo **não** contém regra de negócio. Devolve linhas. Quem decide
 * se pode publicar é `planTransition()`, no pacote.
 */

const TENANT = '00000000-0000-4000-8000-0000000000a1';

/** Data-base fixa: dado de demonstração não pode mudar conforme o dia. */
const AGORA = '2026-07-27T12:00:00.000Z';

function campanha(over: Partial<Campaign> & { id: string; name: string }): Campaign {
  return {
    tenantId: TENANT,
    description: '',
    status: 'draft',
    scheduledFor: null,
    publishedAt: null,
    completedAt: null,
    budgetPlannedCents: null,
    currency: null,
    budgetRef: null,
    budgetStatus: 'none',
    audienceNote: '',
    ...over,
  };
}

const CAMPANHAS: Campaign[] = [
  campanha({
    id: 'c-alfa',
    name: 'Campanha Alfa',
    description: 'Rascunho com verba pedida e ainda sem resposta do financeiro.',
    audienceNote: 'Base própria de contatos ativos nos últimos 12 meses.',
    budgetPlannedCents: 1_200_000,
    currency: 'BRL',
    // ⭐ Aponta para uma decisão que ainda não chegou. É este o estado que a
    // tela precisa saber mostrar sem parecer erro.
    budgetRef: 'AP-2026-0042',
    budgetStatus: 'none',
  }),
  campanha({
    id: 'c-beta',
    name: 'Campanha Beta',
    description: 'Agendada, com verba já aprovada pelo financeiro.',
    status: 'scheduled',
    scheduledFor: '2026-08-15T09:00:00.000Z',
    budgetPlannedCents: 800_000,
    currency: 'BRL',
    budgetRef: 'AP-2026-0031',
    // ⭐ Este valor NÃO foi escrito por esta tela nem por este adapter: no
    // banco de verdade, ele chega pelo correio, vindo do evento de outro
    // módulo. Aqui está fabricado para que a demonstração mostre o estado.
    budgetStatus: 'approved',
  }),
  campanha({
    id: 'c-gama',
    name: 'Campanha Gama',
    description: 'No ar desde o início do mês.',
    status: 'published',
    publishedAt: '2026-07-01T10:00:00.000Z',
    budgetPlannedCents: 450_000,
    currency: 'BRL',
    audienceNote: 'Público amplo, sem segmentação.',
  }),
  campanha({
    id: 'c-delta',
    name: 'Campanha Delta',
    description: 'Encerrada no mês passado.',
    status: 'completed',
    publishedAt: '2026-06-01T10:00:00.000Z',
    completedAt: '2026-06-30T18:00:00.000Z',
  }),
];

const PROJECAO: SpendApproval[] = [
  {
    id: 'sa-1',
    tenantId: TENANT,
    // ⭐ De onde veio. No banco real isto é preenchido com `producedBy` do
    // envelope — o marketing não presume a origem.
    sourceModuleId: 'recon',
    externalRef: 'AP-2026-0031',
    decision: 'approved',
    amountCents: 800_000,
    currency: 'BRL',
    decidedAt: '2026-07-20T14:30:00.000Z',
    receivedAt: '2026-07-20T14:30:02.000Z',
  },
];

export function createMarketingMockPort(): MarketingPort {
  // Em memória, e some a cada requisição — é demonstração, não banco.
  const campanhas = [...CAMPANHAS];

  return {
    kind: 'mock',

    async listPermissions() {
      // Na demonstração o operador vê tudo: esconder botão sem ter banco por
      // trás não prova nada e só atrapalha quem está avaliando o produto.
      return new Set<string>([
        PERMISSIONS.campaignManage,
        PERMISSIONS.campaignPublish,
        PERMISSIONS.resultRecord,
      ]);
    },

    async loadSettings(): Promise<MarketingSettings> {
      // O default do produto, não o processo de ninguém.
      return DEFAULT_SETTINGS;
    },

    async loadCampaigns() {
      return campanhas;
    },

    async loadSpendApprovals() {
      return PROJECAO;
    },

    async createDraft(input) {
      if (input.name.trim().length === 0) {
        throw new DataPortError('A campanha precisa de um nome.');
      }
      const id = `c-${campanhas.length + 1}`;
      campanhas.push(
        campanha({
          id,
          name: input.name,
          description: input.description,
          audienceNote: input.audienceNote,
          scheduledFor: input.scheduledFor,
          budgetPlannedCents: input.budgetPlannedCents,
          currency: input.currency,
          budgetRef: input.budgetRef,
        }),
      );
      return { campaignId: id };
    },

    async applyTransition(input) {
      const alvo = campanhas.findIndex((c) => c.id === input.campaignId);
      if (alvo < 0) throw new DataPortError('Campanha não encontrada.');
      const atual = campanhas[alvo] as Campaign;
      campanhas[alvo] = {
        ...atual,
        status: input.status,
        publishedAt: input.publishedAt ?? atual.publishedAt,
        completedAt: input.completedAt ?? atual.completedAt,
      };
    },
  };
}

/** Só para a tela mostrar de quando é o dado fabricado. */
export const MOCK_NOW = AGORA;
