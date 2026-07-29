/**
 * Tipos do Módulo 12 — Régua de Cobrança.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⚠️ `dun` cobra O CLIENTE DO TENANT; `billing` cobra o tenant. Duas
 * "cobranças" com donos diferentes — não confundir.
 *
 * ⭐ A Lei das Etapas, terceira aplicação: o passo da régua é DADO DO TENANT
 * — nome livre, dias após o vencimento, canal texto livre. Nenhum enum.
 *
 * @see supabase/migrations/0027_dun.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-DUN-SPEC.md — o fluxo de negócio
 */

export type RulerId = string;
export type StepId = string;
export type TitleId = string;
export type TenantId = string;

export type RulerStatus = 'active' | 'archived';

/**
 * O estado de um título projetado — os MESMOS estados que o fato de origem
 * carrega. Há teste que lê a migration e compara a lista.
 */
export type TitleStatus = 'open' | 'partially_received' | 'received' | 'cancelled';

export interface Ruler {
  readonly id: RulerId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly status: RulerStatus;
}

/** Um passo da régua — desenho do tenant, nunca enum do produto. */
export interface RulerStep {
  readonly id: StepId;
  readonly rulerId: RulerId;
  readonly position: number;
  readonly name: string;
  /** Quantos dias após o vencimento este passo se aplica. */
  readonly daysAfterDue: number;
  /** TEXTO LIVRE: "e-mail", "ligação", "visita". Opcional. */
  readonly channel: string | null;
}

/** Um título projetado na régua — alimentado por FATO, nunca por mão. */
export interface DunTitle {
  readonly id: TitleId;
  readonly tenantId: TenantId;
  /** Sempre de `envelope.producedBy` — nunca constante. */
  readonly sourceModuleId: string;
  readonly externalRef: string;
  readonly dueDate: string;
  readonly amountCents: number;
  readonly receivedAmountCents: number;
  readonly currency: string;
  readonly payerName: string | null;
  readonly counterpartyTaxId: string | null;
  readonly description: string;
  readonly status: TitleStatus;
  readonly enteredAt: string | null;
  readonly leftAt: string | null;
}

/** Uma execução de passo — imutável por contrato, com os carimbos. */
export interface StepExecution {
  readonly id: string;
  readonly titleId: TitleId;
  readonly stepId: StepId | null;
  /** O NOME carimbado no momento do ato — sobrevive ao redesenho. */
  readonly stepName: string;
  readonly channel: string | null;
  readonly daysAfterDue: number | null;
  readonly note: string;
  readonly executedAt: string;
}

export interface NewRulerStep {
  readonly name: string;
  readonly position: number;
  readonly daysAfterDue: number;
  readonly channel?: string | null;
}
