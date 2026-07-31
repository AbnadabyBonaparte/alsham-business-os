/**
 * O motor puro do Módulo 57 — Custos do Projeto (Project Costs).
 *
 * ⭐⭐ A física é a do LANÇAMENTO IMUTÁVEL (o `cash`, o `recv`, o `occ`): o custo
 * é fato consumado — nasce e nunca muda. Por isso este motor NÃO TEM transições
 * de ciclo de vida, NÃO TEM `ALLOWED_TRANSITIONS`, NÃO TEM `canTransition`. A
 * ausência é a lei: um teste lê o `0072_pcost.sql` e confere que a migration
 * também não declara `allowed_transition` e não tem coluna de status.
 *
 * ⭐⭐ O DIVERGE do `fund`: NÃO há saldo nem trave. `summarizeEntries` soma o
 * livro por moeda — é um TOTAL, nunca um saldo com piso. Um teste lê o
 * `0055_fund.sql` (que confere o saldo antes de gastar e recusa o negativo) e o
 * `0072_pcost.sql` (que não tem nenhuma guarda de saldo) e assina o contraste.
 */
import type {
  CostEntry,
  CostSummary,
  CurrencyTotal,
  NewCostEntryInput,
  Problem,
  Validation,
} from './types.ts';

/** Do mais recente ao mais antigo — a leitura do livro. Tiebreak estável por id. */
export function orderEntries(entries: readonly CostEntry[]): readonly CostEntry[] {
  return [...entries].sort((a, b) => {
    const da = a.incurredOn ?? '';
    const db = b.incurredOn ?? '';
    if (da !== db) return da < db ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Soma o livro por moeda — total puro, NUNCA um saldo com trave (não há piso: o
 * DIVERGE do `fund`). Cada moeda vira uma linha com o total (soma dos sinais) e
 * a contagem. As moedas saem em ordem estável.
 */
export function summarizeEntries(entries: readonly CostEntry[]): CostSummary {
  const mapa = new Map<string, { totalCents: number; count: number }>();
  for (const e of entries) {
    const atual = mapa.get(e.currency) ?? { totalCents: 0, count: 0 };
    atual.totalCents += e.amountCents;
    atual.count += 1;
    mapa.set(e.currency, atual);
  }
  const byCurrency: CurrencyTotal[] = [...mapa.entries()]
    .map(([currency, v]) => ({ currency, totalCents: v.totalCents, count: v.count }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return { total: entries.length, byCurrency };
}

const PROJECT_NAME_MAX = 200;
const CURRENCY_MAX = 12;
const CATEGORY_MAX = 120;
const NOTE_MAX = 1000;
const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um custo novo. O projeto (id solto) é obrigatório; o valor tem de ser
 * um inteiro `<> 0` (sinal LIVRE, SEM piso/teto — o DIVERGE do `fund`); a moeda
 * é obrigatória; a categoria e a competência são OPCIONAIS. Nasce com `id`
 * vazio: a pura camada nunca inventa dado do servidor.
 */
export function validateNewEntry(input: NewCostEntryInput): Validation<CostEntry> {
  const problems: Problem[] = [];

  // Projeto: id solto obrigatório.
  const projectId = texto(input.projectId);
  if (projectId === null) {
    problems.push({ field: 'projectId', message: 'Informe o projeto do custo.' });
  }

  // Nome do projeto carimbado pela tela — opcional (vira '').
  const nomeBruto = texto(input.projectName);
  let projectName = '';
  if (nomeBruto !== null) {
    if (nomeBruto.length > PROJECT_NAME_MAX) {
      problems.push({ field: 'projectName', message: `Nome com no máximo ${PROJECT_NAME_MAX} caracteres.` });
    } else {
      projectName = nomeBruto;
    }
  }

  // Valor: inteiro finito e diferente de zero. Sinal livre, SEM piso nem teto —
  // não há saldo aqui (o DIVERGE do fund).
  const valor = input.amountCents;
  if (typeof valor !== 'number' || !Number.isInteger(valor)) {
    problems.push({ field: 'amountCents', message: 'Informe o valor do custo em centavos (inteiro).' });
  } else if (valor === 0) {
    problems.push({ field: 'amountCents', message: 'O valor do custo não pode ser zero.' });
  }

  // Moeda: obrigatória (valor e moeda andam juntos).
  const currency = texto(input.currency);
  if (currency === null) {
    problems.push({ field: 'currency', message: 'Informe a moeda do custo.' });
  } else if (currency.length > CURRENCY_MAX) {
    problems.push({ field: 'currency', message: `Moeda com no máximo ${CURRENCY_MAX} caracteres.` });
  }

  // Categoria OPCIONAL — sem categoria é honesto (a lição do cash).
  const categoriaBruta = texto(input.category);
  let category = '';
  if (categoriaBruta !== null) {
    if (categoriaBruta.length > CATEGORY_MAX) {
      problems.push({ field: 'category', message: `Categoria com no máximo ${CATEGORY_MAX} caracteres.` });
    } else {
      category = categoriaBruta;
    }
  }

  // Competência OPCIONAL, no formato ISO. Passado e futuro permitidos (o custo
  // narrado é fato; a competência é do operador).
  const incurredBruto = texto(input.incurredOn);
  let incurredOn: string | null = null;
  if (incurredBruto !== null) {
    if (!DATA_ISO.test(incurredBruto)) {
      problems.push({ field: 'incurredOn', message: 'A data deve estar no formato AAAA-MM-DD.' });
    } else {
      incurredOn = incurredBruto;
    }
  }

  // Nota opcional.
  const notaBruta = texto(input.note);
  let note = '';
  if (notaBruta !== null) {
    if (notaBruta.length > NOTE_MAX) {
      problems.push({ field: 'note', message: `Nota com no máximo ${NOTE_MAX} caracteres.` });
    } else {
      note = notaBruta;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      projectId: projectId!,
      projectName,
      amountCents: valor as number,
      currency: currency!,
      category,
      incurredOn,
      note,
    },
  };
}
