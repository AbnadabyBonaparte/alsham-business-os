/**
 * Tipos puros do Módulo 66 — Requisitos ISO.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o
 * requisito de norma (a cláusula que a empresa precisa cumprir) com a sua
 * conformidade e o seu ciclo de arquivamento.
 *
 * ⭐⭐ **DOIS conceitos DISTINTOS, e é o cerne do módulo:**
 *
 * 1. A **conformidade** (`Compliance`) — `compliant` × `non_compliant` ×
 *    `not_applicable` — é uma AVALIAÇÃO **MUTÁVEL**: qualquer valor vai para
 *    qualquer valor, quantas vezes a auditoria exigir. NÃO é uma máquina de
 *    estados com transições fixas, e NÃO é um ciclo terminal. É o DIVERGE
 *    assinado de todos os módulos com ciclo de vida terminal da onda.
 * 2. O **arquivamento** (`ArchiveStatus`) — `active ↔ archived` — é um ciclo
 *    REVERSÍVEL (a física do `vendor`/`dc`/`pfolio`): a cláusula que sai de
 *    escopo é arquivada e VOLTA se voltar ao escopo. É a MESMA cláusula.
 *
 * @see supabase/migrations/0081_iso.sql
 * @see docs/canon/MODULO-ISO-SPEC.md
 */

/**
 * A conformidade de um requisito.
 *
 * ⭐⭐ **MUTÁVEL, não terminal:** qualquer valor vai para qualquer valor. Hoje a
 * cláusula está conforme; na auditoria que vem pode virar não conforme; num
 * escopo diferente, não se aplica. Não há transição fixa — reavaliar é um
 * UPDATE honesto.
 */
export type Compliance = 'compliant' | 'non_compliant' | 'not_applicable';

/**
 * O estado de arquivamento de um requisito.
 *
 * ⭐ `active ↔ archived` nos DOIS sentidos (a física do `vendor`/`dc`/`pfolio`):
 * uma cláusula fora de escopo é arquivada e VOLTA. Arquivar é metadado
 * reversível, jamais um fim. Este ciclo é OUTRO conceito, distinto da
 * conformidade.
 */
export type ArchiveStatus = 'active' | 'archived';

/**
 * Um requisito de norma. A referência da cláusula e a descrição são texto
 * livre — dado do tenant, nunca lista fechada.
 */
export interface Requirement {
  readonly id: string;
  /** A norma/cláusula em TEXTO LIVRE: "ISO 9001:2015 — 8.5.1", "IATF 16949 — 8.3". */
  readonly clauseReference: string;
  readonly description: string;
  /** ⭐⭐ A avaliação MUTÁVEL — muda a cada auditoria. */
  readonly compliance: Compliance;
  /** ⭐ O ciclo REVERSÍVEL de arquivamento. */
  readonly status: ArchiveStatus;
}

/** A entrada crua de um requisito novo — os campos vêm do formulário. */
export interface NewRequirementInput {
  readonly clauseReference?: unknown;
  readonly description?: unknown;
  readonly compliance?: unknown;
}

/** A entrada crua de uma reavaliação — só a conformidade nova. */
export interface AssessInput {
  readonly compliance?: unknown;
}

/**
 * Um resumo contável dos requisitos — por estado de arquivamento E por
 * conformidade. Todo número é `.length`, nunca chute.
 */
export interface RequirementSummary {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
  readonly compliant: number;
  readonly nonCompliant: number;
  readonly notApplicable: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
