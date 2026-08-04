import type {
  Cents,
  IsoDate,
  MatchOrigin,
  MatchStatus,
  MatchSuggestion,
  MatchingSettings,
  Payable,
  Receivable,
  ReconciliationMatch,
  StatementLine,
} from './types.ts';
import {
  evaluatePair,
  evaluateReceivablePair,
  suggestMatches,
  type PairEvaluation,
} from './matching.ts';

/**
 * A MESA — composição e explicação, **lógica pura, sem I/O**.
 *
 * Duas perguntas que a tela não tem o direito de responder sozinha:
 *
 * 1. **Quais são as sugestões de baixa?** Não é só rodar o motor: casamentos já
 *    GRAVADOS em `recon.reconciliation_matches` (com o score e a estratégia do
 *    momento em que foram feitos) mandam sobre o que o motor recalcularia agora.
 *    `composeMesa` usa o gravado como verdade e só roda o motor no que sobrou —
 *    recalcular por cima do que já foi decidido faria o histórico mentir.
 * 2. **Por que esta linha NÃO casou?** "Sem correspondência" é diagnóstico
 *    nenhum. `explainDivergence` diz se é valor divergente, data fora da janela,
 *    quase-casou (abaixo do limiar) ou órfã de verdade — pela MESMA régua que o
 *    motor usa para casar (`PairEvaluation`), nunca uma segunda.
 *
 * @see docs/canon/MODULO-RECON-SPEC.md
 */

// -----------------------------------------------------------------------------
// A LINHA COM SUA ORIGEM — o gap 1 do benchmark: de qual conta veio a linha
// -----------------------------------------------------------------------------

/** A conta bancária de origem de uma linha — de `recon.bank_statements`. */
export interface StatementLineSource {
  readonly accountRef: string;
  readonly periodStart: IsoDate;
  readonly periodEnd: IsoDate;
}

/**
 * Uma linha do extrato COM a conta bancária de origem resolvida.
 *
 * `source` é `null` só quando o join com o extrato não veio — a tela mostra o
 * fato ("conta não identificada"), nunca inventa uma conta.
 */
export interface SourcedStatementLine extends StatementLine {
  readonly source: StatementLineSource | null;
}

// -----------------------------------------------------------------------------
// POR QUE NÃO CASOU — o gap 4: divergência com motivo, não "sem correspondência"
// -----------------------------------------------------------------------------

/**
 * O motivo de uma linha não ter casado.
 *
 * - `orphan` — não existe título da direção certa (débito→a pagar, crédito→a
 *   receber) com a mesma moeda e saldo em aberto. Provável tarifa, imposto ou
 *   lançamento sem contrapartida: **nunca vai casar** sem um título novo.
 * - `amount-mismatch` — existe título, mas o valor diverge além da tolerância.
 * - `date-out-of-window` — existe título com o valor compatível, mas a data
 *   está fora da janela tolerada.
 * - `below-threshold` — existe candidato dentro das DUAS tolerâncias, mas o
 *   score composto ficou abaixo do limiar do tenant. **Quase casou** — a um
 *   ajuste de política ou a uma conferência humana de distância.
 */
export type DivergenceReason =
  | 'orphan'
  | 'amount-mismatch'
  | 'date-out-of-window'
  | 'below-threshold';

/** O título mais próximo que explica a divergência (quando há candidato). */
export interface NearestCandidate {
  readonly kind: 'payable' | 'receivable';
  readonly targetId: string;
  readonly externalRef: string;
  readonly counterpartyName?: string | null;
  /** Valor devido/a receber do título. */
  readonly amountCents: Cents;
  readonly currency: string;
  /** |fluxo da linha| − saldo restante do título. `0` = valor exato. */
  readonly amountDeltaCents: Cents;
  /** Distância entre a data do lançamento e o vencimento, em dias. */
  readonly dateDeltaDays: number;
  /** Score que o par teria pela régua do motor (0 a 1). */
  readonly score: number;
}

export interface DivergenceExplanation {
  readonly reason: DivergenceReason;
  readonly nearest: NearestCandidate | null;
}

type Candidate = {
  readonly kind: 'payable' | 'receivable';
  readonly targetId: string;
  readonly externalRef: string;
  readonly counterpartyName?: string | null;
  readonly amountCents: Cents;
  readonly currency: string;
  readonly ev: PairEvaluation;
};

function candidatesFor(
  line: StatementLine,
  payables: readonly Payable[],
  receivables: readonly Receivable[],
  settings: MatchingSettings,
): Candidate[] {
  const out: Candidate[] = [];

  if (line.amountCents < 0) {
    for (const p of payables) {
      if (p.status !== 'open' && p.status !== 'partially_settled') continue;
      const ev = evaluatePair(line, p, settings);
      if (ev === null) continue;
      out.push({
        kind: 'payable',
        targetId: p.id,
        externalRef: p.externalRef,
        counterpartyName: p.supplierName,
        amountCents: p.amountCents,
        currency: p.currency,
        ev,
      });
    }
  } else if (line.amountCents > 0) {
    for (const r of receivables) {
      if (r.status !== 'open' && r.status !== 'partially_received') continue;
      const ev = evaluateReceivablePair(line, r, settings);
      if (ev === null) continue;
      out.push({
        kind: 'receivable',
        targetId: r.id,
        externalRef: r.externalRef,
        counterpartyName: r.counterpartyName,
        amountCents: r.amountCents,
        currency: r.currency,
        ev,
      });
    }
  }

  return out;
}

function toNearest(c: Candidate): NearestCandidate {
  return {
    kind: c.kind,
    targetId: c.targetId,
    externalRef: c.externalRef,
    counterpartyName: c.counterpartyName,
    amountCents: c.amountCents,
    currency: c.currency,
    amountDeltaCents: c.ev.amountDeltaCents,
    dateDeltaDays: c.ev.dateDeltaDays,
    score: c.ev.score,
  };
}

/**
 * Explica por que uma linha não casou — pela régua do próprio motor.
 *
 * Ordem de proximidade (a mais próxima primeiro): passou nos dois portões mas
 * fraquejou no score (`below-threshold`) → valor certo, data fora
 * (`date-out-of-window`) → valor errado (`amount-mismatch`) → sem candidato
 * nenhum (`orphan`).
 */
export function explainDivergence(
  line: StatementLine,
  payables: readonly Payable[],
  receivables: readonly Receivable[],
  settings: MatchingSettings,
): DivergenceExplanation {
  const candidates = candidatesFor(line, payables, receivables, settings);
  if (candidates.length === 0) {
    return { reason: 'orphan', nearest: null };
  }

  const amountOk = (c: Candidate): boolean =>
    c.ev.amountDeltaCents <= settings.amountToleranceCents;
  const dateOk = (c: Candidate): boolean =>
    c.ev.dateDeltaDays <= settings.dateToleranceDays;

  // 1. Dentro dos dois portões → só o limiar barrou: QUASE casou.
  const withinBoth = candidates.filter((c) => amountOk(c) && dateOk(c));
  if (withinBoth.length > 0) {
    const best = withinBoth.reduce((a, b) => (b.ev.score > a.ev.score ? b : a));
    return { reason: 'below-threshold', nearest: toNearest(best) };
  }

  // 2. Valor compatível, data fora da janela.
  const valueOk = candidates.filter(amountOk);
  if (valueOk.length > 0) {
    const best = valueOk.reduce((a, b) => (b.ev.dateDeltaDays < a.ev.dateDeltaDays ? b : a));
    return { reason: 'date-out-of-window', nearest: toNearest(best) };
  }

  // 3. Sobrou valor divergente — o portão duro. O mais próximo em valor.
  const best = candidates.reduce((a, b) =>
    b.ev.amountDeltaCents < a.ev.amountDeltaCents ? b : a,
  );
  return { reason: 'amount-mismatch', nearest: toNearest(best) };
}

// -----------------------------------------------------------------------------
// A COMPOSIÇÃO DA MESA — o gap 2: o gravado manda sobre o recalculado
// -----------------------------------------------------------------------------

/** De onde veio a sugestão exibida na mesa. */
export type MesaSuggestionSource = 'stored' | 'computed';

/**
 * Uma sugestão pronta para a mesa.
 *
 * `source === 'stored'` — veio de `reconciliation_matches` (status `suggested`);
 * `matchOrigin`/`matchStatus` carregam a procedência gravada. O score e a
 * estratégia são os DO BANCO, não um recálculo.
 *
 * `source === 'computed'` — o motor propôs agora, para uma linha que ainda não
 * tinha casamento gravado nenhum.
 */
export interface MesaSuggestion {
  readonly source: MesaSuggestionSource;
  readonly suggestion: MatchSuggestion;
  readonly matchOrigin?: MatchOrigin;
  readonly matchStatus?: MatchStatus;
}

export interface ClassifiedDivergence {
  readonly line: SourcedStatementLine;
  readonly explanation: DivergenceExplanation;
}

export interface MesaComposition {
  readonly suggestions: readonly MesaSuggestion[];
  readonly divergences: readonly ClassifiedDivergence[];
}

function targetKeyOfMatch(m: ReconciliationMatch): string | null {
  if (m.payableId) return `p:${m.payableId}`;
  if (m.receivableId) return `r:${m.receivableId}`;
  return null;
}

function storedToSuggestion(m: ReconciliationMatch): MatchSuggestion | null {
  // Score/estratégia gravados. Manual não tem score — vira confiança plena,
  // e a procedência 'manual' (matchOrigin) é o que a tela mostra em vez do número.
  const score = m.score ?? 1;
  const strategy = m.strategy ?? 'manual';
  if (m.payableId) {
    return {
      kind: 'payable',
      statementLineId: m.statementLineId,
      payableId: m.payableId,
      matchedAmountCents: m.matchedAmountCents,
      score,
      strategy,
    };
  }
  if (m.receivableId) {
    return {
      kind: 'receivable',
      statementLineId: m.statementLineId,
      receivableId: m.receivableId,
      matchedAmountCents: m.matchedAmountCents,
      score,
      strategy,
    };
  }
  return null;
}

/**
 * Compõe a mesa: casamentos GRAVADOS (status `suggested`) primeiro, o motor só
 * no que sobrou, e a divergência classificada no que não casou de jeito nenhum.
 *
 * Os títulos e as linhas já reivindicados por um casamento gravado saem do
 * bolo antes de o motor rodar — senão o motor proporia de novo o que já está
 * na mesa, e o mesmo título casaria com duas linhas.
 */
export function composeMesa(
  lines: readonly SourcedStatementLine[],
  storedMatches: readonly ReconciliationMatch[],
  payables: readonly Payable[],
  settings: MatchingSettings,
  receivables: readonly Receivable[] = [],
): MesaComposition {
  const lineIds = new Set(lines.map((l) => l.id));
  const openPayableIds = new Set(
    payables.filter((p) => p.status === 'open' || p.status === 'partially_settled').map((p) => p.id),
  );
  const openReceivableIds = new Set(
    receivables
      .filter((r) => r.status === 'open' || r.status === 'partially_received')
      .map((r) => r.id),
  );

  // 1. Casamentos gravados pendentes cujos dois lados ainda estão vivos.
  const stored: MesaSuggestion[] = [];
  const claimedLines = new Set<string>();
  const claimedTargets = new Set<string>();

  for (const m of storedMatches) {
    if (m.status !== 'suggested') continue;
    if (!lineIds.has(m.statementLineId)) continue;
    if (claimedLines.has(m.statementLineId)) continue;
    const key = targetKeyOfMatch(m);
    if (key === null || claimedTargets.has(key)) continue;
    const targetAlive = m.payableId
      ? openPayableIds.has(m.payableId)
      : m.receivableId
        ? openReceivableIds.has(m.receivableId)
        : false;
    if (!targetAlive) continue;

    const suggestion = storedToSuggestion(m);
    if (suggestion === null) continue;

    stored.push({
      source: 'stored',
      suggestion,
      matchOrigin: m.origin,
      matchStatus: m.status,
    });
    claimedLines.add(m.statementLineId);
    claimedTargets.add(key);
  }

  // 2. O motor roda só no que sobrou — linhas e títulos não reivindicados.
  const remainingLines = lines.filter((l) => !claimedLines.has(l.id));
  const remainingPayables = payables.filter((p) => !claimedTargets.has(`p:${p.id}`));
  const remainingReceivables = receivables.filter((r) => !claimedTargets.has(`r:${r.id}`));

  const computed: MesaSuggestion[] = suggestMatches(
    remainingLines,
    remainingPayables,
    settings,
    remainingReceivables,
  ).map((suggestion) => ({ source: 'computed', suggestion }));

  const suggestions = [...stored, ...computed];

  // 3. Divergência: o que não virou sugestão nenhuma — classificado.
  const suggestedLineIds = new Set(suggestions.map((s) => s.suggestion.statementLineId));
  const divergences: ClassifiedDivergence[] = lines
    .filter((l) => !suggestedLineIds.has(l.id))
    .map((line) => ({
      line,
      explanation: explainDivergence(line, payables, receivables, settings),
    }));

  return { suggestions, divergences };
}
