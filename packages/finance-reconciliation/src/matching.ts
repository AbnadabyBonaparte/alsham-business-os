import type {
  Cents,
  MatchSuggestion,
  MatchingSettings,
  Payable,
  Receivable,
  StatementLine,
} from './types.ts';

/**
 * O motor de sugestão de baixa — **lógica pura, determinística, sem I/O**.
 *
 * Direcional desde a conciliação de recebimentos:
 *   · débito (amount < 0)  ↔ título a pagar
 *   · crédito (amount > 0) ↔ título a receber
 *
 * Nada aqui toca banco, rede ou relógio. Política (tolerâncias / limiar) entra
 * por `MatchingSettings`.
 */

/** Peso de cada sinal. Fixo: é a régua do produto, não do tenant. */
const WEIGHTS = {
  amount: 5,
  taxId: 4,
  reference: 3,
  date: 2,
  name: 1,
} as const;

/** Um sinal que disparou, com sua força de 0 a 1. */
interface Signal {
  readonly key: string;
  readonly weight: number;
  readonly strength: number;
}

interface ScoredPair {
  readonly score: number;
  readonly strategy: string;
  readonly matchedAmountCents: Cents;
}

/** Remove tudo que não for alfanumérico e sobe para maiúsculas. */
export function normalizeTaxId(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  return cleaned.length > 0 ? cleaned : null;
}

/** Minúsculas, sem acento, espaços colapsados. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Distância em dias entre duas datas-calendário `YYYY-MM-DD`.
 *
 * Construída em UTC a partir das partes, nunca por `new Date(string)`: fuso
 * horário do servidor não pode mudar o resultado de uma conciliação.
 */
export function daysBetween(a: string, b: string): number {
  const toUtc = (iso: string): number => {
    const parts = iso.split('-');
    const [y, m, d] = [Number(parts[0]), Number(parts[1]), Number(parts[2])];
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
      throw new TypeError(`data inválida: ${iso}`);
    }
    return Date.UTC(y, m - 1, d);
  };
  return Math.abs(toUtc(a) - toUtc(b)) / 86_400_000;
}

/** Decaimento linear: 0 de distância → 1; no limite da tolerância → 0. */
function decay(distance: number, tolerance: number): number {
  if (distance === 0) return 1;
  if (tolerance <= 0) return 0;
  if (distance > tolerance) return 0;
  return 1 - distance / tolerance;
}

/** Proporção de palavras do menor nome presentes no maior. */
function nameOverlap(a: string, b: string): number {
  const wordsOf = (s: string): string[] =>
    normalizeText(s)
      .split(' ')
      .filter((w) => w.length >= 3);

  const wa = new Set(wordsOf(a));
  const wb = new Set(wordsOf(b));
  if (wa.size === 0 || wb.size === 0) return 0;

  let hits = 0;
  for (const w of wa) if (wb.has(w)) hits += 1;
  return hits / Math.min(wa.size, wb.size);
}

function scoreSignals(
  line: StatementLine,
  remaining: number,
  flowAbs: number,
  dueDate: string,
  externalRef: string,
  taxId: string | null | undefined,
  counterpartyName: string | null | undefined,
  settings: MatchingSettings,
): ScoredPair | null {
  const amountDistance = Math.abs(flowAbs - remaining);
  if (amountDistance > settings.amountToleranceCents) return null;

  const signals: Signal[] = [
    {
      key: 'amount',
      weight: WEIGHTS.amount,
      strength: decay(amountDistance, settings.amountToleranceCents),
    },
    {
      key: 'date',
      weight: WEIGHTS.date,
      strength: decay(daysBetween(line.postedAt, dueDate), settings.dateToleranceDays),
    },
  ];

  const lineTax = normalizeTaxId(line.counterpartyTaxId);
  const otherTax = normalizeTaxId(taxId);
  if (lineTax && otherTax) {
    signals.push({
      key: 'tax-id',
      weight: WEIGHTS.taxId,
      strength: lineTax === otherTax ? 1 : 0,
    });
  }

  const ref = normalizeText(externalRef);
  if (ref.length >= 4) {
    signals.push({
      key: 'reference',
      weight: WEIGHTS.reference,
      strength: normalizeText(line.description).includes(ref) ? 1 : 0,
    });
  }

  if (line.counterpartyName && counterpartyName) {
    signals.push({
      key: 'name',
      weight: WEIGHTS.name,
      strength: nameOverlap(line.counterpartyName, counterpartyName),
    });
  }

  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  const weighted = signals.reduce((sum, s) => sum + s.weight * s.strength, 0);
  const score = Math.round((weighted / totalWeight) * 10_000) / 10_000;

  if (score < settings.minScore) return null;

  const strategy = signals
    .filter((s) => s.strength > 0)
    .map((s) => s.key)
    .join('+');

  return {
    score,
    strategy,
    matchedAmountCents: Math.min(flowAbs, remaining),
  };
}

/**
 * Pontua um par linha↔título a pagar.
 *
 * Portão: só **débito** (saída). Crédito nunca quita conta a pagar.
 */
export function scorePair(
  line: StatementLine,
  payable: Payable,
  settings: MatchingSettings,
): ScoredPair | null {
  // Título a pagar quita-se com SAÍDA de dinheiro. Entrada não é candidata.
  if (line.amountCents >= 0) return null;

  if (line.currency !== payable.currency) return null;

  const outflow = Math.abs(line.amountCents);
  const remaining = payable.amountCents - payable.settledAmountCents;
  if (remaining <= 0) return null;

  return scoreSignals(
    line,
    remaining,
    outflow,
    payable.dueDate,
    payable.externalRef,
    payable.supplierTaxId,
    payable.supplierName,
    settings,
  );
}

/**
 * Pontua um par linha↔título a receber.
 *
 * Portão: só **crédito** (entrada). Débito nunca quita conta a receber.
 * Saldo restante nunca negativo — receber a maior zera o candidato.
 */
export function scoreReceivablePair(
  line: StatementLine,
  receivable: Receivable,
  settings: MatchingSettings,
): ScoredPair | null {
  // Título a receber quita-se com ENTRADA de dinheiro. Saída não é candidata.
  if (line.amountCents <= 0) return null;

  if (line.currency !== receivable.currency) return null;

  const inflow = line.amountCents;
  const remaining = Math.max(0, receivable.amountCents - receivable.receivedAmountCents);
  if (remaining <= 0) return null;

  return scoreSignals(
    line,
    remaining,
    inflow,
    receivable.dueDate,
    receivable.externalRef,
    receivable.counterpartyTaxId,
    receivable.counterpartyName,
    settings,
  );
}

function targetKey(s: MatchSuggestion): string {
  return s.kind === 'payable' ? `p:${s.payableId}` : `r:${s.receivableId}`;
}

/**
 * Sugere casamentos entre linhas de extrato e títulos (a pagar e/ou a receber).
 *
 * Atribuição gulosa **1:1** por linha e por título. Empates: score ↓,
 * `statementLineId`, chave do alvo — mesma entrada, mesma saída.
 *
 * `receivables` é opcional para não quebrar quem ainda só passa payables.
 */
export function suggestMatches(
  lines: readonly StatementLine[],
  payables: readonly Payable[],
  settings: MatchingSettings,
  receivables: readonly Receivable[] = [],
): MatchSuggestion[] {
  const openLines = lines.filter(
    (l) => l.status === 'unmatched' || l.status === 'suggested',
  );
  const openPayables = payables.filter(
    (p) => p.status === 'open' || p.status === 'partially_settled',
  );
  const openReceivables = receivables.filter(
    (r) => r.status === 'open' || r.status === 'partially_received',
  );

  const candidates: MatchSuggestion[] = [];

  for (const line of openLines) {
    for (const payable of openPayables) {
      const scored = scorePair(line, payable, settings);
      if (scored === null) continue;
      candidates.push({
        kind: 'payable',
        statementLineId: line.id,
        payableId: payable.id,
        matchedAmountCents: scored.matchedAmountCents,
        score: scored.score,
        strategy: scored.strategy,
      });
    }
    for (const receivable of openReceivables) {
      const scored = scoreReceivablePair(line, receivable, settings);
      if (scored === null) continue;
      candidates.push({
        kind: 'receivable',
        statementLineId: line.id,
        receivableId: receivable.id,
        matchedAmountCents: scored.matchedAmountCents,
        score: scored.score,
        strategy: scored.strategy,
      });
    }
  }

  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.statementLineId.localeCompare(b.statementLineId) ||
      targetKey(a).localeCompare(targetKey(b)),
  );

  const usedLines = new Set<string>();
  const usedTargets = new Set<string>();
  const chosen: MatchSuggestion[] = [];

  for (const c of candidates) {
    const key = targetKey(c);
    if (usedLines.has(c.statementLineId) || usedTargets.has(key)) continue;
    usedLines.add(c.statementLineId);
    usedTargets.add(key);
    chosen.push(c);
  }

  return chosen;
}

/**
 * As linhas que sobraram — **a divergência**.
 */
export function unmatchedLines(
  lines: readonly StatementLine[],
  suggestions: readonly MatchSuggestion[],
): StatementLine[] {
  const matched = new Set(suggestions.map((s) => s.statementLineId));
  return lines.filter(
    (l) =>
      (l.status === 'unmatched' || l.status === 'suggested') && !matched.has(l.id),
  );
}

export interface StatementSummary {
  readonly totalLines: number;
  readonly matchedLines: number;
  /** A DIVERGÊNCIA. O número que interessa ao diretor. */
  readonly unmatchedLines: number;
  readonly ignoredLines: number;
  readonly matchedAmountCents: Cents;
  readonly unmatchedAmountCents: Cents;
  /** Um extrato só deveria fechar quando não sobrou nada em aberto. */
  readonly readyToClose: boolean;
}

/**
 * Resume um extrato a partir das suas linhas.
 */
export function summarizeStatement(lines: readonly StatementLine[]): StatementSummary {
  let matched = 0;
  let ignored = 0;
  let open = 0;
  let matchedAmount = 0;
  let unmatchedAmount = 0;

  for (const l of lines) {
    if (l.status === 'matched') {
      matched += 1;
      matchedAmount += Math.abs(l.amountCents);
    } else if (l.status === 'ignored') {
      ignored += 1;
    } else {
      open += 1;
      unmatchedAmount += Math.abs(l.amountCents);
    }
  }

  return {
    totalLines: lines.length,
    matchedLines: matched,
    unmatchedLines: open,
    ignoredLines: ignored,
    matchedAmountCents: matchedAmount,
    unmatchedAmountCents: unmatchedAmount,
    readyToClose: open === 0 && lines.length > 0,
  };
}
