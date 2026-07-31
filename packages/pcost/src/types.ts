/**
 * Tipos puros do Módulo 57 — Custos do Projeto (Project Costs).
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o custo como
 * LANÇAMENTO IMUTÁVEL — quanto se gastou, em qual projeto e quando. Não há
 * ciclo de vida (é fato consumado), então não há `Status` nem transição neste
 * módulo. E não há saldo nem trave: o custo só narra o gasto (o DIVERGE do
 * `fund`).
 */

/** Um custo lançado. Campos carimbados pelo servidor nascem vazios. */
export interface CostEntry {
  readonly id: string;
  /** ID SOLTO ao projeto (proj) — obrigatório. */
  readonly projectId: string;
  /** O nome do projeto carimbado pela tela. Pode ser vazio. */
  readonly projectName: string;
  /**
   * O valor em centavos, junto com a moeda. Sinal LIVRE: `> 0` é gasto (o
   * custo, o caso normal); `< 0` é crédito/estorno (a correção pelo ato
   * inverso). Nunca zero — zero é linha muda. SEM piso, SEM teto (o DIVERGE
   * do `fund`: não há saldo aqui).
   */
  readonly amountCents: number;
  /** A moeda do valor — ex. `BRL`. Valor e moeda andam juntos. */
  readonly currency: string;
  /** Categoria TEXTO LIVRE, OPCIONAL — sem categoria é honesto (a lição do cash). */
  readonly category: string;
  /** A competência do custo — `YYYY-MM-DD`, ou `null` (opcional). */
  readonly incurredOn: string | null;
  /** Nota TEXTO LIVRE, opcional. */
  readonly note: string;
}

/** A entrada crua de um custo novo — os campos vêm do formulário. */
export interface NewCostEntryInput {
  readonly projectId?: unknown;
  readonly projectName?: unknown;
  readonly amountCents?: unknown;
  readonly currency?: unknown;
  readonly category?: unknown;
  readonly incurredOn?: unknown;
  readonly note?: unknown;
}

/**
 * Um total por moeda. É soma pura do livro — NUNCA um saldo com trave (não há
 * piso: o DIVERGE do `fund`).
 */
export interface CurrencyTotal {
  readonly currency: string;
  readonly totalCents: number;
  readonly count: number;
}

/** Um resumo contável do livro. Todo número é `.length`/soma, nunca chute. */
export interface CostSummary {
  readonly total: number;
  readonly byCurrency: readonly CurrencyTotal[];
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
