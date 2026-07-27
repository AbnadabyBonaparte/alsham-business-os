import type {
  Cents,
  MatchSuggestion,
  MatchingSettings,
  Payable,
  StatementLine,
} from './types.ts';

/**
 * O motor de sugestão de baixa — **lógica pura, determinística, sem I/O**.
 *
 * Minerado do Smart Reconciliation™ (Roadmap, Fase 3): *"sugestão automática
 * de baixa e IA que identifica divergências"*. Esta é a primeira metade —
 * a sugestão. A IA que aprende padrões é da Fase 3 e está **NÃO CONSTRUÍDA**;
 * o campo `strategy`, gravado a cada casamento, é o que vai alimentá-la.
 *
 * **Nada aqui toca banco, rede ou relógio.** Mesma entrada, mesma saída,
 * sempre — é o que torna o motor testável sem infraestrutura, e é por isso
 * que ele mora no pacote e não numa function do Postgres.
 *
 * **Nada aqui embute política.** Toleranças e limiar chegam por
 * `MatchingSettings`, que vem de `core.tenant_modules.settings`. A função
 * aplica a política do tenant; ela não tem uma.
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

/**
 * Pontua um par linha↔título.
 *
 * Devolve `null` quando o par **não é candidato** — e o único portão
 * eliminatório é o valor. Fora da tolerância de valor, não há score que
 * salve: conciliação que casa valores diferentes não é conciliação.
 */
export function scorePair(
  line: StatementLine,
  payable: Payable,
  settings: MatchingSettings,
): { score: number; strategy: string; matchedAmountCents: Cents } | null {
  // Título a pagar quita-se com SAÍDA de dinheiro. Entrada não é candidata.
  if (line.amountCents >= 0) return null;

  // Moedas diferentes não se conciliam. Conversão é outra capacidade.
  if (line.currency !== payable.currency) return null;

  const outflow = Math.abs(line.amountCents);
  const remaining = payable.amountCents - payable.settledAmountCents;
  if (remaining <= 0) return null;

  const amountDistance = Math.abs(outflow - remaining);
  if (amountDistance > settings.amountToleranceCents) return null;

  const signals: Signal[] = [
    {
      key: 'amount',
      weight: WEIGHTS.amount,
      strength: decay(amountDistance, settings.amountToleranceCents),
    },
  ];

  // Data: aplica-se sempre, porque as duas datas sempre existem.
  signals.push({
    key: 'date',
    weight: WEIGHTS.date,
    strength: decay(daysBetween(line.postedAt, payable.dueDate), settings.dateToleranceDays),
  });

  // Identificador fiscal: só entra na conta quando os DOIS lados o têm.
  // Ausente não é evidência contra — é ausência de evidência.
  const lineTax = normalizeTaxId(line.counterpartyTaxId);
  const payableTax = normalizeTaxId(payable.supplierTaxId);
  if (lineTax && payableTax) {
    signals.push({
      key: 'tax-id',
      weight: WEIGHTS.taxId,
      strength: lineTax === payableTax ? 1 : 0,
    });
  }

  // Referência do título citada na descrição do lançamento.
  // Referência curta demais casaria por acaso; abaixo de 4 caracteres, ignora.
  const ref = normalizeText(payable.externalRef);
  if (ref.length >= 4) {
    signals.push({
      key: 'reference',
      weight: WEIGHTS.reference,
      strength: normalizeText(line.description).includes(ref) ? 1 : 0,
    });
  }

  // Nome da contraparte: o sinal mais fraco, e de propósito.
  if (line.counterpartyName && payable.supplierName) {
    signals.push({
      key: 'name',
      weight: WEIGHTS.name,
      strength: nameOverlap(line.counterpartyName, payable.supplierName),
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
    // Baixa parcial: casa-se o menor dos dois, nunca mais do que se deve.
    matchedAmountCents: Math.min(outflow, remaining),
  };
}

/**
 * Sugere casamentos entre linhas de extrato e títulos a pagar.
 *
 * Estratégia: pontua todos os pares candidatos, ordena por confiança e faz
 * atribuição gulosa **1:1** — cada linha vai para no máximo um título, cada
 * título recebe no máximo uma linha.
 *
 * A escolha do 1:1 é honesta, não ingênua: o schema permite baixa parcial e
 * muitos-para-muitos, e o humano pode montar isso na tela. O que a sugestão
 * automática **não** faz é tentar adivinhar rateio — combinação de N linhas
 * para M títulos multiplica o risco de sugerir bobagem com cara de certeza.
 * Rateio automático é candidato à Fase 3, junto com a IA.
 *
 * Determinístico: empates são desfeitos por `statementLineId` e `payableId`,
 * então a mesma entrada devolve sempre a mesma saída, em qualquer máquina.
 */
export function suggestMatches(
  lines: readonly StatementLine[],
  payables: readonly Payable[],
  settings: MatchingSettings,
): MatchSuggestion[] {
  const openLines = lines.filter(
    (l) => l.status === 'unmatched' || l.status === 'suggested',
  );
  const openPayables = payables.filter(
    (p) => p.status === 'open' || p.status === 'partially_settled',
  );

  const candidates: MatchSuggestion[] = [];
  for (const line of openLines) {
    for (const payable of openPayables) {
      const scored = scorePair(line, payable, settings);
      if (scored === null) continue;
      candidates.push({
        statementLineId: line.id,
        payableId: payable.id,
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
      a.payableId.localeCompare(b.payableId),
  );

  const usedLines = new Set<string>();
  const usedPayables = new Set<string>();
  const chosen: MatchSuggestion[] = [];

  for (const c of candidates) {
    if (usedLines.has(c.statementLineId) || usedPayables.has(c.payableId)) continue;
    usedLines.add(c.statementLineId);
    usedPayables.add(c.payableId);
    chosen.push(c);
  }

  return chosen;
}

/**
 * As linhas que sobraram — **a divergência**.
 *
 * É o número que interessa ao humano depois de rodar o motor: não o que
 * casou, e sim o que não casou e vai precisar de olho e de caneta.
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

/**
 * O retrato de um extrato: o que casou e — o que interessa — o que sobrou.
 *
 * É o número que o operador olha antes de fechar o período, e o mesmo que
 * viaja no evento `recon.reconciliation.completed`.
 */
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
 *
 * ⭐ Vive aqui, e não na tela, porque **define o que conta como conciliado** —
 * e isso é regra de negócio. `ignored` sai da conta de divergência de
 * propósito: linha marcada como ignorada foi uma decisão humana, não uma
 * pendência.
 *
 * `readyToClose` é uma LEITURA, não uma permissão: quem pode fechar é a
 * policy no banco, e se o tenant quiser fechar com divergência em aberto,
 * isso é política dele (`settings.approval.*`), não trava do produto.
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
