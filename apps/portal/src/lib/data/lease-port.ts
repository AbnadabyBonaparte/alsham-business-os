/**
 * Porta de dados do Módulo 39 — própria (Lei do Lego §5.5.8).
 *
 * ⭐ **Somente leitura.** Não existe criar, encerrar ou lançar venda aqui — a
 * escrita é frente de UI à parte. Esta é a tela da camada COMERCIAL de locação:
 * o `lease` é fino sobre o `ctr` (vigência/reajuste/renovação moram lá) e sobre
 * o `mall` (o lojista mora lá). Aqui só se REFERENCIA por id solto e se mostra o
 * NOME carimbado — nunca se reescreve o que é de outro módulo (Regra de Ouro).
 */

/** Um contrato de locação — a camada comercial sobre o `ctr` (por id solto). */
export interface LeaseAgreementRow {
  readonly id: string;
  /** Nome do lojista, carimbado do `mall` (id solto). Não se reconsulta o mall. */
  readonly storeName: string;
  /** Referência ao contrato no `ctr` (id solto) — onde a vigência de fato mora. */
  readonly contractRef: string;
  /** O percentual sobre faturamento — texto livre (o módulo não calcula). */
  readonly revenueShare: string;
  readonly status: 'active' | 'ended';
  /** Razão do encerramento — vazio quando ativo. */
  readonly endReason: string;
}

/**
 * Uma venda declarada pelo lojista — o LIVRO mensal imutável.
 *
 * É o "dado de primeira classe" do benchmark de shopping (TOTVS/Group/MRI): o
 * aluguel percentual depende dele. Cada linha é uma competência (mês) por
 * contrato; `agreementId` amarra ao contrato de locação (id solto intra-módulo).
 */
export interface LeaseSalesReportRow {
  readonly id: string;
  readonly agreementId: string;
  /** Competência mensal, `YYYY-MM-DD` (dia 1 do mês). */
  readonly competency: string;
  readonly amountCents: number;
  readonly currency: string;
  readonly note: string;
}

export interface LeasePort {
  readonly kind: 'mock' | 'supabase';
  listPermissions(): Promise<ReadonlySet<string>>;
  loadAgreements(): Promise<LeaseAgreementRow[]>;
  loadSalesReports(): Promise<LeaseSalesReportRow[]>;
}
