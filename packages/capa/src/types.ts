/**
 * Tipos puros do Módulo 65 — CAPA (Ações Corretivas e Preventivas).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a
 * ação corretiva/preventiva e o seu ciclo (`open → verified → closed`), com o
 * tipo `corrective` × `preventive` como CHECK — a FÍSICA do método CAPA, não
 * vocabulário de uma casa.
 *
 * ⭐ **A VERIFICAÇÃO é o que define o módulo:** uma ação só está fechada quando
 * alguém confirmou que ela FUNCIONOU. Sem passar por `verified`, não fecha — é
 * exatamente isso que separa a CAPA de um marco de cronograma genérico.
 *
 * @see supabase/migrations/0080_capa.sql
 * @see docs/canon/MODULO-CAPA-SPEC.md
 */

/**
 * O estado de uma ação.
 *
 * ⭐ O ciclo é `open → verified → closed`, escolhido de PROPÓSITO (sem o
 * `open → closed` direto): a verificação é o ponto. `closed` é TERMINAL — uma
 * ação que volta é ação nova (a física do `proj`).
 */
export type CapaStatus = 'open' | 'verified' | 'closed';

/**
 * O tipo de uma ação.
 *
 * ⭐ CHECK, não texto do tenant: `corrective` × `preventive` é a FÍSICA do
 * MÉTODO CAPA (a norma o define) — a lição do `mnt` (corretiva/preventiva) e do
 * `nps` (0–10). Corretiva nasce de um desvio já ocorrido; preventiva evita um
 * que ainda não ocorreu.
 */
export type CapaType = 'corrective' | 'preventive';

/** Uma ação corretiva/preventiva. Descrição/responsável em texto livre. */
export interface Action {
  readonly id: string;
  readonly actionType: CapaType;
  readonly description: string;
  readonly responsible: string;
  /** Prazo — data ISO `yyyy-mm-dd`, ou `null` (opcional). */
  readonly dueDate: string | null;
  /** Vínculo OPCIONAL ao `nc` (Módulo 63) por ID SOLTO. `null` se preventiva sem NC. */
  readonly ncEntryId: string | null;
  readonly status: CapaStatus;
  /** A nota de quem confirmou que a ação funcionou. Vazia enquanto `open`. */
  readonly verificationNote: string;
}

/** A entrada crua de uma ação nova — os campos vêm do formulário. */
export interface NewActionInput {
  readonly actionType?: unknown;
  readonly description?: unknown;
  readonly responsible?: unknown;
  readonly dueDate?: unknown;
  readonly ncEntryId?: unknown;
}

/** A entrada crua da verificação — a nota é o que faz a CAPA não ser um marco. */
export interface VerifyInput {
  readonly verificationNote?: unknown;
}

/** Um resumo contável das ações. Todo número é `.length`, nunca chute. */
export interface ActionSummary {
  readonly total: number;
  readonly open: number;
  readonly verified: number;
  readonly closed: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
