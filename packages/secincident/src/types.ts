/**
 * Tipos puros do Módulo 79 — Resposta a Incidentes de Segurança.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o
 * incidente de segurança dos sistemas DO TENANT e a sua TIMELINE DE RESPOSTA
 * (o ciclo NIST: `detected → contained → eradicated → recovered → closed`, com
 * o atalho de falso-positivo `detected → closed`) — e o livro imutável de atos
 * da resposta.
 *
 * ⭐⭐ **O DIVERGE assinado — secincident × occ (Módulo 16, Operações):** a
 * ocorrência é FATO CONSUMADO com UM par de transição (`open → closed`) e nasce
 * IMUTÁVEL. O incidente NÃO: são CINCO estados (a operação de resposta se
 * conduz, não se registra e encerra) e é EDITÁVEL ENQUANTO ABERTO (o
 * entendimento evolui: o vetor se descobre investigando, o escopo cresce),
 * congelando só no fechamento (a física do `risk`, não a imutabilidade do
 * `occ`).
 *
 * ⭐ **Os campos PRÓPRIOS que o `occ` não tem:** `attackVector` (como entraram)
 * e `affectedData` (o que foi comprometido) — texto livre; `severity` 1–5.
 *
 * @see supabase/migrations/0094_secincident.sql
 * @see docs/canon/MODULO-SECINCIDENT-SPEC.md
 */

/**
 * O estado de um incidente de segurança.
 *
 * ⭐ O ciclo NIST linear (`detected → contained → eradicated → recovered →
 * closed`) mais o atalho de falso-positivo (`detected → closed`). `closed` é
 * TERMINAL — o que recorre é incidente novo. São CINCO estados (o DIVERGE do
 * `occ`, que tem UM par).
 */
export type IncidentStatus =
  | 'detected'
  | 'contained'
  | 'eradicated'
  | 'recovered'
  | 'closed';

/**
 * Um incidente de segurança: o registro do evento constatado nos sistemas do
 * tenant, com a sua timeline de resposta. Editável enquanto aberto; congela no
 * fechamento.
 */
export interface SecurityIncident {
  readonly id: string;
  /** O título curto do incidente. Obrigatório. */
  readonly title: string;
  /** A descrição do que foi constatado. Obrigatória. */
  readonly description: string;
  /**
   * ⭐ O vetor de ataque, TEXTO LIVRE opcional — `''` quando ausente. Como
   * entraram; o entendimento evolui durante a resposta.
   */
  readonly attackVector: string;
  /**
   * ⭐ Os dados comprometidos, TEXTO LIVRE opcional — `''` quando ausente. O
   * que foi comprometido; o escopo cresce enquanto se investiga.
   */
  readonly affectedData: string;
  /** 1–5 (régua do método — CHECK argumentado no banco). */
  readonly severity: number;
  /** ISO — quando foi DETECTADO. Aceita passado; recusa futuro. */
  readonly detectedAt: string;
  readonly status: IncidentStatus;
  /**
   * A nota de encerramento (lições aprendidas / conclusão), obrigatória ao
   * fechar. `''` enquanto o incidente está aberto.
   */
  readonly closeNote: string;
}

/**
 * Uma ação de resposta: um passo da timeline, ato IMUTÁVEL (a física da
 * tratativa do `occ` — o que se manteve, de propósito).
 */
export interface ResponseAction {
  readonly id: string;
  readonly incidentId: string;
  readonly actionTaken: string;
  /** ISO — quando o passo da resposta ocorreu. */
  readonly occurredAt: string;
}

/** A entrada crua de um incidente novo — os campos vêm do formulário. */
export interface NewIncidentInput {
  readonly title?: unknown;
  readonly description?: unknown;
  readonly attackVector?: unknown;
  readonly affectedData?: unknown;
  readonly severity?: unknown;
  readonly detectedAt?: unknown;
}

/** A entrada crua de uma ação de resposta nova. */
export interface NewActionInput {
  readonly actionTaken?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
