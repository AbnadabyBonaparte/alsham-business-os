/**
 * Tipos puros do Módulo 60 — Riscos do projeto.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o
 * risco de um projeto (probabilidade × impacto na régua 1–5) e o seu ciclo
 * (open → mitigated → closed) — com a FÍSICA NOVA de que `mitigated` REABRE,
 * mas `closed` é TERMINAL.
 *
 * Vínculo ao projeto por ID SOLTO (o `proj` não é lido).
 *
 * @see supabase/migrations/0075_risk.sql
 * @see docs/canon/MODULO-RISK-SPEC.md
 */

/**
 * O estado de um risco.
 *
 * ⭐⭐ FÍSICA NOVA: `mitigated` NÃO é terminal — um risco mitigado REABRE
 * (`mitigated → open`) quando a mitigação para de funcionar (o mesmo risco, não
 * um novo). Mas `closed` é TERMINAL: um risco que passou está encerrado, e um
 * risco que volta a ocorrer é registro NOVO. É o DIVERGE assinado do
 * `scrum`/`proj`, cujos estados não-iniciais são TODOS terminais.
 */
export type RiskStatus = 'open' | 'mitigated' | 'closed';

/**
 * Um risco. O projeto entra por id solto; os carimbos de mitigação e
 * fechamento (feitos pelo servidor) nascem nulos. `probability` e `impact` são
 * a régua 1–5 (física do método — CHECK argumentado no banco).
 */
export interface Risk {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly description: string;
  /** 1–5 (régua do método). */
  readonly probability: number;
  /** 1–5 (régua do método). */
  readonly impact: number;
  readonly mitigationPlan: string;
  readonly status: RiskStatus;
  /** ISO (YYYY-MM-DDThh:mm:ssZ) ou vazio — só para ordenar a leitura. */
  readonly createdAt: string;
}

export interface NewRiskInput {
  readonly projectId?: unknown;
  readonly projectName?: unknown;
  readonly description?: unknown;
  readonly probability?: unknown;
  readonly impact?: unknown;
  readonly mitigationPlan?: unknown;
}

/** Um resumo contável dos riscos. Todo número é `.length`, nunca chute. */
export interface RiskSummary {
  readonly total: number;
  readonly open: number;
  readonly mitigated: number;
  readonly closed: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
