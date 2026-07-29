import type {
  Funnel,
  FunnelColumn,
  FunnelStage,
  NewFunnelStage,
  NewOpportunity,
  Opportunity,
  OpportunityStatus,
} from './types.ts';

/**
 * O motor do funil — **puro**.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** o quadro, o forecast e a validação
 * moram aqui. A tela pergunta e desenha; ela nunca monta coluna à mão nem
 * multiplica valor por probabilidade num componente.
 */

/**
 * ⭐ Ciclo de vida — espelho de `deal.allowed_transition()` em `0025_deal.sql`.
 * Dois pares, e a brevidade É a decisão: `won` e `lost` são TERMINAIS. O
 * desfecho é registrado com razão; o cliente que volta é negociação NOVA, e a
 * história da anterior fica inteira para se aprender com ela.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [OpportunityStatus, OpportunityStatus])[] = [
  ['open', 'won'],
  ['open', 'lost'],
] as const;

export function canTransition(from: OpportunityStatus, to: OpportunityStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** Ganhar e perder só existem para negociação ABERTA. */
export function canClose(status: OpportunityStatus): boolean {
  return status === 'open';
}

export function isOpen(status: OpportunityStatus): boolean {
  return status === 'open';
}

/** Os estágios de um funil, na ordem — por `position`, nunca por chegada. */
export function orderedStages(stages: readonly FunnelStage[]): readonly FunnelStage[] {
  return [...stages].sort((a, b) => a.position - b.position);
}

/**
 * O QUADRO: uma coluna por estágio DO TENANT, com as negociações ABERTAS.
 *
 * Negociação encerrada não entra em coluna nenhuma — pendurá-la na última
 * fingiria que ainda está no mapa, e a coluna final acumularia para sempre
 * tudo o que já se decidiu.
 */
export function buildFunnelBoard(
  stages: readonly FunnelStage[],
  opportunities: readonly Opportunity[],
): readonly FunnelColumn[] {
  return orderedStages(stages).map((stage) => ({
    stage,
    opportunities: opportunities.filter(
      (o) => isOpen(o.status) && o.currentStageId === stage.id,
    ),
  }));
}

/**
 * ⭐ O FORECAST — valor ponderado pela probabilidade DA MÃO HUMANA.
 * Sem probabilidade, a negociação não entra na conta ponderada (contar como
 * 100% inflaria; como 0% esconderia — não inventar número é a Lei 7).
 */
export function weightedCents(o: Opportunity): number | null {
  if (o.valueCents === null || o.probability === null) return null;
  return Math.round((o.valueCents * o.probability) / 100);
}

/** A data esperada passou e a negociação segue aberta? */
export function isPastExpectedClose(o: Opportunity, today: string): boolean {
  if (o.expectedCloseDate === null) return false;
  if (!isOpen(o.status)) return false;
  return o.expectedCloseDate < today;
}

const NOME_MAX = 200;

/** O erro de validação de uma oportunidade nova, ou `null`. */
export function validateNewOpportunity(input: NewOpportunity): string | null {
  if (input.title.trim().length === 0) {
    return 'A negociação precisa de um título.';
  }
  if (input.funnelId.trim().length === 0) {
    return 'A negociação precisa nascer num funil.';
  }
  const temValor = input.valueCents != null;
  const temMoeda = input.currency != null && input.currency.trim().length > 0;
  if (temValor !== temMoeda) {
    return 'Valor e moeda andam juntos: informe os dois, ou nenhum.';
  }
  if (temValor && (!Number.isInteger(input.valueCents) || input.valueCents! < 0)) {
    return 'O valor vai em centavos, inteiro e não negativo.';
  }
  if (temMoeda && !/^[A-Z]{3}$/.test(input.currency!.trim().toUpperCase())) {
    return 'A moeda é o código ISO de três letras.';
  }
  if (input.probability != null) {
    if (!Number.isInteger(input.probability) || input.probability < 0 || input.probability > 100) {
      return 'A probabilidade é um inteiro de 0 a 100.';
    }
  }
  if (input.expectedCloseDate != null && input.expectedCloseDate.trim().length > 0) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.expectedCloseDate)) {
      return 'A expectativa de fechamento vai no formato AAAA-MM-DD.';
    }
  }
  if (input.partyName != null && input.partyName.length > NOME_MAX) {
    return `O nome da contraparte vai até ${NOME_MAX} caracteres.`;
  }
  return null;
}

/** O erro de validação de um funil novo, ou `null`. Molde do ops. */
export function validateFunnelStages(stages: readonly NewFunnelStage[]): string | null {
  if (stages.length === 0) {
    return 'O funil precisa de pelo menos um estágio.';
  }
  for (const s of stages) {
    if (s.name.trim().length === 0) return 'Todo estágio precisa de um nome.';
  }
  const nomes = stages.map((s) => s.name.trim().toLowerCase());
  if (new Set(nomes).size !== nomes.length) {
    return 'Dois estágios com o mesmo nome no mesmo funil só geram engano.';
  }
  const posicoes = stages.map((s) => s.position);
  if (new Set(posicoes).size !== posicoes.length) {
    return 'Dois estágios não podem ocupar a mesma posição.';
  }
  return null;
}

/** Motivo pelo qual perder não é possível agora, ou `null` se é. */
export function whyCannotLose(o: Opportunity, reason: string): string | null {
  if (!canClose(o.status)) {
    return 'A negociação já foi encerrada — voltar é oportunidade nova.';
  }
  if (reason.trim().length === 0) {
    return 'Perder exige a razão: o funil existe para se aprender por que se perde.';
  }
  return null;
}

/** Um resumo do funil, para o cabeçalho. Contagem, nunca estimativa. */
export function summarizeFunnel(opportunities: readonly Opportunity[]): {
  readonly total: number;
  readonly open: number;
  readonly won: number;
  readonly lost: number;
  readonly openCentsByCurrency: ReadonlyMap<string, number>;
  readonly weightedCentsByCurrency: ReadonlyMap<string, number>;
} {
  const openCents = new Map<string, number>();
  const weighted = new Map<string, number>();
  for (const o of opportunities) {
    if (!isOpen(o.status)) continue;
    if (o.valueCents !== null && o.currency !== null) {
      openCents.set(o.currency, (openCents.get(o.currency) ?? 0) + o.valueCents);
      const w = weightedCents(o);
      if (w !== null) {
        weighted.set(o.currency, (weighted.get(o.currency) ?? 0) + w);
      }
    }
  }
  return {
    total: opportunities.length,
    open: opportunities.filter((o) => o.status === 'open').length,
    won: opportunities.filter((o) => o.status === 'won').length,
    lost: opportunities.filter((o) => o.status === 'lost').length,
    openCentsByCurrency: openCents,
    weightedCentsByCurrency: weighted,
  };
}

/** Os funis ativos, para o seletor. */
export function activeFunnels(funnels: readonly Funnel[]): readonly Funnel[] {
  return funnels.filter((f) => f.status === 'active');
}
