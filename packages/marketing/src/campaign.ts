import type { Campaign, CampaignStatus, MarketingSettings, SpendApproval } from './types.ts';
import { DEFAULT_SETTINGS } from './types.ts';

/**
 * **A máquina de estados da campanha** — o motor deste módulo.
 *
 * ⭐ Regra de Ouro (CLAUDE.md §5.3): isto vive em `packages/` porque é
 * DECISÃO. A tela pergunta *"posso publicar?"* e mostra a resposta; ela não
 * sabe responder, e não deve.
 *
 * ⚠️ Puro e determinístico: sem I/O, sem relógio próprio, sem banco. O agora
 * entra por parâmetro — regra de agendamento não se prova com o relógio solto.
 *
 * O banco tem CHECKs que espelham parte disto, e a divisão é deliberada:
 * o banco garante **integridade** (publicada tem carimbo de publicação), este
 * arquivo decide **política** (pode passar de agendada para publicada?).
 * Integridade é do dado; política é do produto.
 */

/**
 * As passagens permitidas. Tudo que não está aqui é proibido — lista de
 * permissão, não de proibição, para que estado novo nasça fechado.
 */
const TRANSICOES: Readonly<Record<CampaignStatus, readonly CampaignStatus[]>> = {
  draft: ['scheduled', 'published', 'cancelled'],
  scheduled: ['draft', 'published', 'cancelled'],
  published: ['completed', 'cancelled'],
  // Terminais. Campanha encerrada não volta: reabrir apaga a fronteira entre
  // o que aconteceu e o que se quis que acontecesse.
  completed: [],
  cancelled: [],
};

/** A passagem existe no mapa? Não diz se é permitida AGORA — para isso, `planTransition`. */
export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return TRANSICOES[from].includes(to);
}

/** Por que uma passagem foi negada. A tela mostra isto ao humano, literalmente. */
export type TransitionRefusal =
  | { readonly code: 'same-status'; readonly message: string }
  | { readonly code: 'illegal-transition'; readonly message: string }
  | { readonly code: 'schedule-missing'; readonly message: string }
  | { readonly code: 'schedule-in-past'; readonly message: string }
  | { readonly code: 'budget-not-cleared'; readonly message: string }
  | { readonly code: 'name-empty'; readonly message: string };

export type TransitionVerdict =
  | {
      readonly allowed: true;
      /** Os campos que a passagem carimba. Quem grava aplica isto e nada mais. */
      readonly stamps: {
        readonly status: CampaignStatus;
        readonly publishedAt?: string;
        readonly completedAt?: string;
      };
    }
  | { readonly allowed: false; readonly refusal: TransitionRefusal };

/**
 * A campanha pode ir para `to` agora?
 *
 * Devolve, quando pode, **os carimbos** que a passagem implica — para que
 * quem grava não precise saber que publicar preenche `published_at`. Regra
 * duplicada entre motor e adaptador é regra que diverge.
 */
export function planTransition(input: {
  readonly campaign: Pick<Campaign, 'name' | 'status' | 'scheduledFor' | 'budgetStatus'>;
  readonly to: CampaignStatus;
  readonly now: Date;
  readonly settings?: MarketingSettings;
}): TransitionVerdict {
  const { campaign, to, now } = input;
  const settings = input.settings ?? DEFAULT_SETTINGS;

  if (campaign.status === to) {
    return {
      allowed: false,
      refusal: { code: 'same-status', message: `A campanha já está em "${to}".` },
    };
  }

  if (!canTransition(campaign.status, to)) {
    return {
      allowed: false,
      refusal: {
        code: 'illegal-transition',
        message: `Não existe passagem de "${campaign.status}" para "${to}".`,
      },
    };
  }

  // Campanha sem nome é campanha que ninguém acha depois. Vale para qualquer
  // saída do rascunho, não só para publicar.
  if (to !== 'cancelled' && campaign.name.trim().length === 0) {
    return {
      allowed: false,
      refusal: { code: 'name-empty', message: 'A campanha precisa de um nome.' },
    };
  }

  if (to === 'scheduled') {
    if (!campaign.scheduledFor) {
      return {
        allowed: false,
        refusal: {
          code: 'schedule-missing',
          message: 'Agendar exige uma data — senão "agendada" não quer dizer nada.',
        },
      };
    }
    if (settings.requireFutureSchedule && new Date(campaign.scheduledFor) <= now) {
      return {
        allowed: false,
        refusal: {
          code: 'schedule-in-past',
          message: 'A data de agendamento já passou.',
        },
      };
    }
  }

  // ⭐ A LEI ANTI-VIÉS, EM UMA LINHA.
  //
  // Exigir verba aprovada antes de publicar é o processo de ALGUMAS empresas,
  // não de todas. Por isso a exigência vem de `settings` do tenant, e o
  // default é não exigir. Se isto fosse um `if` sem condição de configuração,
  // o produto teria adotado a burocracia de um cliente.
  if (to === 'published' && settings.requireBudgetClearance && campaign.budgetStatus !== 'approved') {
    return {
      allowed: false,
      refusal: {
        code: 'budget-not-cleared',
        message:
          campaign.budgetStatus === 'rejected'
            ? 'A verba desta campanha foi reprovada.'
            : 'Este tenant exige verba aprovada antes de publicar, e ainda não há aprovação.',
      },
    };
  }

  const quando = now.toISOString();
  if (to === 'published') {
    return { allowed: true, stamps: { status: to, publishedAt: quando } };
  }
  if (to === 'completed') {
    return { allowed: true, stamps: { status: to, completedAt: quando } };
  }
  return { allowed: true, stamps: { status: to } };
}

/** Uma campanha em estado terminal não aceita mais nenhuma passagem. */
export function isTerminal(status: CampaignStatus): boolean {
  return TRANSICOES[status].length === 0;
}

/**
 * O estado de verba de uma referência, olhando a projeção local.
 *
 * ⭐ **Por que isto existe:** a decisão de verba pode chegar ANTES de a
 * campanha existir. Uma projeção que só servisse para carimbar campanhas já
 * criadas perderia todo fato que chegasse cedo — e o sintoma seria uma
 * campanha eternamente sem aprovação, com a aprovação guardada no banco.
 *
 * Puro: recebe a lista, devolve o veredito. Quem lê o banco é quem chama.
 */
export function budgetStatusFor(
  budgetRef: string | null,
  approvals: readonly SpendApproval[],
): 'none' | 'approved' | 'rejected' {
  if (!budgetRef) return 'none';
  const achado = approvals.find((a) => a.externalRef === budgetRef);
  return achado ? achado.decision : 'none';
}

/** Resumo de uma carteira de campanhas, para o cabeçalho da tela. */
export function summarizeCampaigns(campaigns: readonly Campaign[]): {
  readonly total: number;
  readonly live: number;
  readonly draft: number;
  readonly awaitingBudget: number;
} {
  return {
    total: campaigns.length,
    live: campaigns.filter((c) => c.status === 'published').length,
    draft: campaigns.filter((c) => c.status === 'draft').length,
    // Tem referência financeira e ninguém se pronunciou. É o número que faz
    // alguém ir cobrar o financeiro.
    awaitingBudget: campaigns.filter(
      (c) => c.budgetRef !== null && c.budgetStatus === 'none' && !isTerminal(c.status),
    ).length,
  };
}
