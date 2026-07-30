/**
 * Tipos do Módulo 37 — Políticas.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐⭐ O DIVERGE do comm — a razão de existir deste módulo: no `comm` o
 * documento (o comunicado) é a identidade e a ciência é única e eterna por
 * (documento, membro). Aqui a política tem VERSÃO, e a identidade do que
 * se dá ciência é a VERSÃO — não a política. Publicar uma versão nova
 * exige que quem deu ciência da anterior dê ciência DE NOVO.
 *
 * ⚠️ O HOMÔNIMO: a *Políticas* de GRC (compliance corporativo) é matéria
 * distinta — aqui é a política interna de pessoal que o membro dá ciência.
 *
 * @see supabase/migrations/0052_pol.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-POL-SPEC.md — o fluxo de negócio
 */

export type PolicyStatus = 'active' | 'archived';

export type VersionStatus = 'draft' | 'published' | 'archived';

export interface Policy {
  readonly id: string;
  readonly name: string;
  readonly status: PolicyStatus;
}

export interface PolicyVersion {
  readonly id: string;
  readonly policyId: string;
  /** ⭐ Calculado pelo servidor — nunca digitado pela tela. */
  readonly versionNo: number;
  readonly body: string;
  readonly status: VersionStatus;
  /** O ato de publicar — do servidor. */
  readonly publishedAt: string | null;
}

/** Uma ciência — ato próprio, único POR VERSÃO, e eterno. */
export interface Acknowledgement {
  readonly id: string;
  readonly versionId: string;
  readonly userId: string;
  readonly ackedAt: string;
}

export interface NewPolicyInput {
  readonly name?: unknown;
}

export interface NewVersionInput {
  readonly policyId?: unknown;
  readonly body?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
