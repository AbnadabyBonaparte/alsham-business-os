/**
 * Tipos puros do Módulo 67 — Métricas Ambientais (ESG).
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a leitura ambiental
 * como ATO IMUTÁVEL — quanto de uma métrica se mediu, em que unidade e em que
 * período. Não há ciclo de vida (é fato consumado), então não há `Status` nem
 * transição neste módulo. E não há trave: a leitura só narra a medição.
 *
 * ⭐⭐ A decisão de canon: UM módulo para as quatro capacidades de medição do
 * Domain (Inventário de carbono, Consumo de água, Consumo de energia, Gestão de
 * resíduos). Na física são a mesma coisa — quantidade + unidade + período. O
 * que as distingue é o `MetricType`, um CHECK das quatro dimensões clássicas do
 * método (ESG/GHG Protocol), não um enum de vocabulário do produto.
 *
 * ⭐ O contraste assinado da quantidade: `pcost` mede dinheiro (`<> 0`, sinal
 * livre — o estorno é negativo); `timesheet` mede horas (`> 0` — zero é linha
 * muda); `esg` mede uma grandeza física (`>= 0` — zero é leitura real e
 * reportável, negativo é infísico).
 *
 * @see supabase/migrations/0082_esg.sql
 * @see docs/canon/MODULO-ESG-SPEC.md
 */

/**
 * As quatro dimensões clássicas de rastreamento ambiental (ESG/GHG Protocol).
 * É a física do método, não vocabulário do tenant — por isso é uma lista
 * fechada (CHECK no banco), não uma tabela do tenant.
 */
export const METRIC_TYPES = ['carbon', 'water', 'energy', 'waste'] as const;

export type MetricType = (typeof METRIC_TYPES)[number];

/** Uma leitura ambiental. Campos carimbados pelo servidor nascem vazios. */
export interface EsgReading {
  readonly id: string;
  /** A dimensão medida — uma das quatro do método. */
  readonly metricType: MetricType;
  /**
   * A quantidade medida. SEMPRE `>= 0`: zero é uma leitura real (zero resíduo
   * ao aterro é reportável); negativo é infísico. Corrigir é registrar outra
   * leitura, nunca um número negativo.
   */
  readonly quantity: number;
  /**
   * A unidade em TEXTO LIVRE — o tenant escolhe (tCO2e, m³, kWh, kg). Não-vazia.
   */
  readonly unit: string;
  /** A data de referência da leitura — `YYYY-MM-DD`, obrigatória. */
  readonly referenceOn: string;
  /**
   * A fonte da leitura por ID SOLTO, OPCIONAL — emissão por obra, por unidade.
   * Vínculo genérico, sem FK. `null` quando ausente.
   */
  readonly sourceId: string | null;
  /** O nome da fonte carimbado pela tela. Pode ser vazio. */
  readonly sourceName: string;
  /** Nota TEXTO LIVRE, OPCIONAL. */
  readonly note: string;
}

/** A entrada crua de uma leitura nova — os campos vêm do formulário. */
export interface NewEsgReadingInput {
  readonly metricType?: unknown;
  readonly quantity?: unknown;
  readonly unit?: unknown;
  readonly referenceOn?: unknown;
  readonly sourceId?: unknown;
  readonly sourceName?: unknown;
  readonly note?: unknown;
}

/**
 * O total de uma métrica NUMA unidade — soma pura do livro. A unidade entra na
 * chave de propósito: somar kg com toneladas é mentira, então cada par
 * (métrica, unidade) é uma linha própria.
 */
export interface MetricUnitTotal {
  readonly metricType: MetricType;
  readonly unit: string;
  readonly totalQuantity: number;
  readonly count: number;
}

/** Um resumo contável do livro. Todo número é `.length`/soma, nunca chute. */
export interface EsgSummary {
  readonly total: number;
  readonly byMetricUnit: readonly MetricUnitTotal[];
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
