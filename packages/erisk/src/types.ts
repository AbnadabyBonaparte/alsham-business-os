/**
 * Tipos puros do Módulo 75 — Risco Corporativo.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o
 * risco ESTRATÉGICO do negócio (probabilidade × impacto na régua 1–5) e o seu
 * ciclo (open → mitigated → closed) — com a FÍSICA do `risk` MANTIDA: `mitigated`
 * REABRE, mas `closed` é TERMINAL.
 *
 * ⭐⭐ O DIVERGE do `risk` (Módulo 60, PMO): este risco NÃO tem projeto. O `risk`
 * é escopado a um projeto (risco de ENTREGA); o `erisk` é o risco do NEGÓCIO —
 * vive enquanto a empresa vive, não enquanto um projeto vive. Daí os campos que
 * o `risk` não tem: `category`, `owner`/`ownerId`, `treatment` e `controlId`.
 *
 * @see supabase/migrations/0090_erisk.sql
 * @see docs/canon/MODULO-ERISK-SPEC.md
 */

/**
 * O estado de um risco corporativo.
 *
 * ⭐⭐ FÍSICA MANTIDA do `risk` (assinada): `mitigated` NÃO é terminal — um risco
 * mitigado REABRE (`mitigated → open`) quando a mitigação para de funcionar (o
 * mesmo risco, não um novo). Mas `closed` é TERMINAL: um risco encerrado está
 * encerrado, e um risco que volta a ocorrer é registro NOVO.
 */
export type RiskStatus = 'open' | 'mitigated' | 'closed';

/**
 * A estratégia de tratamento — os 4 T's da ISO 31000. CHECK argumentado no
 * banco (física do MÉTODO, não vocabulário de casa):
 *   • `accept`   — aceitar o risco como está;
 *   • `mitigate` — reduzir probabilidade/impacto;
 *   • `transfer` — transferir (seguro, terceirização);
 *   • `avoid`    — evitar (não fazer a atividade que expõe).
 */
export type Treatment = 'accept' | 'mitigate' | 'transfer' | 'avoid';

/**
 * Um risco corporativo. `category` e `owner` são texto livre (vocabulário de
 * cada casa); `ownerId` e `controlId` são id SOLTO opcional (ao hr e ao
 * control). `treatment` é opcional — um risco recém-registrado pode ainda não
 * ter a estratégia decidida (Lei 7: quem decide, escreve). `probability` e
 * `impact` são a régua 1–5 (física do método — CHECK argumentado no banco).
 */
export interface EnterpriseRisk {
  readonly id: string;
  readonly description: string;
  readonly category: string;
  readonly owner: string;
  /** id solto opcional ao hr (o DONO do risco). */
  readonly ownerId: string | null;
  /** 1–5 (régua do método). */
  readonly probability: number;
  /** 1–5 (régua do método). */
  readonly impact: number;
  /** A estratégia — os 4 T's. Opcional: pode não ter sido decidida ainda. */
  readonly treatment: Treatment | null;
  readonly treatmentPlan: string;
  /** id solto opcional ao control (o controle interno que mitiga). */
  readonly controlId: string | null;
  readonly status: RiskStatus;
}

export interface NewRiskInput {
  readonly description?: unknown;
  readonly category?: unknown;
  readonly owner?: unknown;
  readonly ownerId?: unknown;
  readonly probability?: unknown;
  readonly impact?: unknown;
  readonly treatment?: unknown;
  readonly treatmentPlan?: unknown;
  readonly controlId?: unknown;
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
