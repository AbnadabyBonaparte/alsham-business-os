import type {
  Category,
  CategoryStatus,
  Entry,
  EntryKind,
  NewEntryInput,
  Problem,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 14 — Fluxo de Caixa.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). O relógio entra por
 * parâmetro (`todayIso`) — o pacote não olha o calendário sozinho.
 */

/**
 * ⭐ Espelho de `cash.allowed_transition()` no `0029_cash.sql` (a categoria)
 * — há teste que lê a migration e compara.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [CategoryStatus, CategoryStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

export function canTransition(from: CategoryStatus, to: CategoryStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** ⭐ O sinal é do TIPO, nunca do operador — o desenho do inv no dinheiro. */
export function signedAmountCents(entry: Pick<Entry, 'kind' | 'amountCents'>): number {
  return entry.kind === 'out' ? -entry.amountCents : entry.amountCents;
}

/** Registrar é operação; AJUSTAR reescreve a conta — permissão própria. */
export function permissionForEntry(kind: EntryKind): string {
  return kind === 'adjustment' ? 'cash.entry.adjust' : 'cash.entry.register';
}

export interface CurrencyBalance {
  readonly currency: string;
  readonly balanceCents: number;
  readonly inflowCents: number;
  readonly outflowCents: number;
  readonly entryCount: number;
}

/** ⭐ O saldo é SOMA do livro — nunca coluna, nunca conta da tela. */
export function balancesByCurrency(entries: readonly Entry[]): readonly CurrencyBalance[] {
  const porMoeda = new Map<string, { balance: number; inflow: number; outflow: number; n: number }>();
  for (const e of entries) {
    const s = signedAmountCents(e);
    const acc = porMoeda.get(e.currency) ?? { balance: 0, inflow: 0, outflow: 0, n: 0 };
    acc.balance += s;
    if (s > 0) acc.inflow += s;
    else acc.outflow += -s;
    acc.n += 1;
    porMoeda.set(e.currency, acc);
  }
  return [...porMoeda.entries()]
    .map(([currency, a]) => ({
      currency,
      balanceCents: a.balance,
      inflowCents: a.inflow,
      outflowCents: a.outflow,
      entryCount: a.n,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export interface CategoryTotal {
  readonly categoryId: string | null;
  /** `null` = o "sem categoria" honesto — aparece, nunca se esconde. */
  readonly categoryName: string | null;
  readonly currency: string;
  readonly netCents: number;
  readonly entryCount: number;
}

export function totalsByCategory(
  entries: readonly Entry[],
  categories: readonly Category[],
): readonly CategoryTotal[] {
  const nomes = new Map(categories.map((c) => [c.id, c.name]));
  const grupos = new Map<string, { categoryId: string | null; currency: string; net: number; n: number }>();
  for (const e of entries) {
    const chave = `${e.categoryId ?? '∅'}|${e.currency}`;
    const g = grupos.get(chave) ?? { categoryId: e.categoryId, currency: e.currency, net: 0, n: 0 };
    g.net += signedAmountCents(e);
    g.n += 1;
    grupos.set(chave, g);
  }
  return [...grupos.values()]
    .map((g) => ({
      categoryId: g.categoryId,
      categoryName: g.categoryId === null ? null : (nomes.get(g.categoryId) ?? null),
      currency: g.currency,
      netCents: g.net,
      entryCount: g.n,
    }))
    .sort((a, b) => Math.abs(b.netCents) - Math.abs(a.netCents));
}

export interface MonthFlow {
  readonly month: string;
  readonly currency: string;
  readonly inflowCents: number;
  readonly outflowCents: number;
  readonly netCents: number;
}

export function monthlyFlow(entries: readonly Entry[]): readonly MonthFlow[] {
  const meses = new Map<string, { inflow: number; outflow: number }>();
  for (const e of entries) {
    const mes = e.occurredOn.slice(0, 7);
    const chave = `${mes}|${e.currency}`;
    const m = meses.get(chave) ?? { inflow: 0, outflow: 0 };
    const s = signedAmountCents(e);
    if (s > 0) m.inflow += s;
    else m.outflow += -s;
    meses.set(chave, m);
  }
  return [...meses.entries()]
    .map(([chave, m]) => {
      const [month, currency] = chave.split('|');
      return {
        month: month!,
        currency: currency!,
        inflowCents: m.inflow,
        outflowCents: m.outflow,
        netCents: m.inflow - m.outflow,
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}

const DESC_MAX = 500;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um lançamento novo. ⭐ `todayIso` entra por parâmetro: o FUTURO é
 * recusado AQUI — previsão é Orçamento, não caixa (DIVERGE consciente do
 * inv, que aceita qualquer data porque o físico já aconteceu).
 */
export function validateNewEntry(input: NewEntryInput, todayIso: string): Validation<Entry> {
  const problems: Problem[] = [];

  const kind = input.kind;
  if (kind !== 'in' && kind !== 'out' && kind !== 'adjustment') {
    problems.push({ field: 'kind', message: 'O lançamento é entrada, saída ou ajuste.' });
  }

  const rawAmount = input.amountCents;
  let amountCents: number | null =
    typeof rawAmount === 'number' && Number.isInteger(rawAmount) ? rawAmount : null;
  if (amountCents === null) {
    problems.push({ field: 'amountCents', message: 'Informe o valor em centavos inteiros.' });
  } else if (kind === 'adjustment') {
    if (amountCents === 0) {
      problems.push({ field: 'amountCents', message: 'Ajuste de zero não ajusta nada.' });
      amountCents = null;
    }
  } else if (amountCents <= 0) {
    problems.push({ field: 'amountCents', message: 'Entrada e saída são sempre positivas — o sinal é do tipo.' });
    amountCents = null;
  }

  const currency = texto(input.currency)?.toUpperCase() ?? null;
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'Informe a moeda ISO (três letras).' });
  }

  const reason = texto(input.reason) ?? '';
  if (kind === 'adjustment' && reason.length === 0) {
    problems.push({ field: 'reason', message: 'Ajuste exige a razão — a linha muda esconde o desvio.' });
  }

  let description = texto(input.description) ?? '';
  if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
    description = description.slice(0, DESC_MAX);
  }

  const occurredOn = texto(input.occurredOn) ?? todayIso;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    problems.push({ field: 'occurredOn', message: 'Data no formato AAAA-MM-DD.' });
  } else if (occurredOn > todayIso) {
    problems.push({
      field: 'occurredOn',
      message: 'O caixa registra o que ACONTECEU: lançamento futuro é previsão, e previsão é Orçamento.',
    });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      kind: kind as EntryKind,
      amountCents: amountCents!,
      currency: currency!,
      description,
      reason,
      categoryId: texto(input.categoryId),
      account: texto(input.account),
      externalRef: texto(input.externalRef),
      occurredOn,
    },
  };
}

export function validateNewCategory(name: unknown): Validation<Pick<Category, 'name'>> {
  const limpo = texto(name);
  if (limpo === null) {
    return { ok: false, problems: [{ field: 'name', message: 'A categoria precisa de um nome.' }] };
  }
  if (limpo.length > 80) {
    return { ok: false, problems: [{ field: 'name', message: 'Nome com no máximo 80 caracteres.' }] };
  }
  return { ok: true, value: { name: limpo } };
}

export interface CashSummary {
  readonly total: number;
  readonly uncategorized: number;
  readonly adjustments: number;
}

export function summarizeEntries(entries: readonly Entry[]): CashSummary {
  let uncategorized = 0;
  let adjustments = 0;
  for (const e of entries) {
    if (e.categoryId === null) uncategorized += 1;
    if (e.kind === 'adjustment') adjustments += 1;
  }
  return { total: entries.length, uncategorized, adjustments };
}
