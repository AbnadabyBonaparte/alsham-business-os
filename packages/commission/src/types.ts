/**
 * Tipos puros do Módulo 99 — Comissões (Vertical Beleza).
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a comissão como
 * LANÇAMENTO IMUTÁVEL — quanto um profissional ganhou por um serviço, e em que
 * dia. Não há ciclo de vida (é fato consumado), então não há `Status` nem
 * transição neste módulo.
 *
 * ⚠️ **NÃO é motor de cálculo (Lei 7).** O `commissionAmountCents` é o valor
 * que QUEM LANÇA declara — o sistema nunca o deriva de um percentual sobre o
 * `baseAmountCents`. O `baseAmountCents` (o preço do serviço prestado) é apenas
 * INFORMATIVO: registra sobre quanto a comissão foi combinada, mas o módulo não
 * multiplica nada.
 *
 * @see supabase/migrations/0114_commission.sql
 * @see docs/canon/MODULO-COMMISSION-SPEC.md
 */

/** Uma comissão lançada. Campos carimbados pelo servidor nascem vazios. */
export interface Commission {
  readonly id: string;
  /** ID SOLTO ao cadastro de profissional — obrigatório. Sem FK. */
  readonly professionalId: string;
  /** O nome do profissional carimbado pela tela. Obrigatório e não-vazio. */
  readonly professionalName: string;
  /**
   * O serviço prestado, em TEXTO LIVRE (corte, coloração, manicure…) —
   * vocabulário de cada salão, NUNCA enum. Obrigatório e não-vazio.
   */
  readonly service: string;
  /**
   * O preço do serviço sobre o qual a comissão foi combinada — INFORMATIVO,
   * OPCIONAL. O sistema NÃO calcula a comissão a partir dele. `null` quando
   * ausente.
   */
  readonly baseAmountCents: number | null;
  /**
   * O valor da comissão, em centavos. REGISTRADO por quem lança (nunca
   * derivado de uma regra de %). Sempre `>= 0`: zero é permitido (serviço de
   * cortesia sem comissão), negativo não — corrigir a mais é lançar o ato
   * inverso, nunca um número negativo aqui.
   */
  readonly commissionAmountCents: number;
  /** O dia em que o serviço/comissão aconteceu — `YYYY-MM-DD`, obrigatório. */
  readonly occurredOn: string;
  /** Observação TEXTO LIVRE, OPCIONAL. */
  readonly note: string;
}

/** A entrada crua de uma comissão nova — os campos vêm do formulário. */
export interface NewCommissionInput {
  readonly professionalId?: unknown;
  readonly professionalName?: unknown;
  readonly service?: unknown;
  readonly baseAmountCents?: unknown;
  readonly commissionAmountCents?: unknown;
  readonly occurredOn?: unknown;
  readonly note?: unknown;
}

/** O total de comissões de um profissional — soma pura do livro. */
export interface ProfessionalCommission {
  readonly professionalName: string;
  readonly totalCents: number;
  readonly count: number;
}

/** Um resumo contável do livro. Todo número é `.length`/soma, nunca chute. */
export interface CommissionSummary {
  readonly total: number;
  readonly totalCents: number;
  readonly byProfessional: readonly ProfessionalCommission[];
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
