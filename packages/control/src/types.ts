/**
 * Tipos puros do Módulo 76 — Controles Internos.
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: o CONTROLE (a rotina
 * de verificação que a empresa desenha para se proteger, com o seu ciclo de
 * vida) e o TESTE do controle (o fato consumado — data, resultado, nota).
 *
 * ⭐ Duas físicas num módulo só:
 *   • o `control` é CADASTRO — `active ↔ archived` (a relação que volta, a física
 *     do `vendor`). Tem status e transição.
 *   • o `test` é LIVRO IMUTÁVEL — fato consumado (a física do `timesheet`). NÃO
 *     tem status, NÃO tem transição, NÃO tem `updated_at`. Corrigir é registrar
 *     outro teste, nunca reescrever.
 *
 * NÃO é `pol` (o documento versionado com ciência), NÃO é `audit` (o evento de
 * verificação com achados), NÃO é `erisk` (o que pode dar errado). O controle é
 * a ROTINA PERMANENTE que se testa.
 *
 * @see supabase/migrations/0091_control.sql
 * @see docs/canon/MODULO-CONTROL-SPEC.md
 */

/** O ciclo de vida do controle. `active ↔ archived` (o controle volta). */
export type ControlStatus = 'active' | 'archived';

/**
 * O tipo do controle — CHECK argumentado (física do COSO, não vocabulário de
 * casa). Fora dos três não é "outro tipo"; é dado inválido.
 */
export type ControlType = 'preventive' | 'detective' | 'corrective';

/** O resultado de um teste do controle — binário (passou ou não passou). */
export type TestResult = 'pass' | 'fail';

/** Um controle interno cadastrado. Campos carimbados pelo servidor nascem vazios. */
export interface InternalControl {
  readonly id: string;
  readonly name: string;
  /** Descrição TEXTO LIVRE, OPCIONAL. Pode ser vazia. */
  readonly description: string;
  readonly controlType: ControlType;
  /** Dono do controle — TEXTO LIVRE, opcional. Pode ser vazio. */
  readonly owner: string;
  /** Frequência de teste — TEXTO LIVRE, opcional (ex.: "mensal"). Pode ser vazia. */
  readonly frequency: string;
  /** Vínculo OPCIONAL ao risco que o controle mitiga (id solto ao erisk). `null` quando ausente. */
  readonly eriskId: string | null;
  readonly status: ControlStatus;
}

/**
 * Um teste do controle — FATO CONSUMADO. Nasce e nunca muda. Sem status, sem
 * ciclo de vida.
 */
export interface ControlTest {
  readonly id: string;
  /** ID SOLTO ao controle testado — obrigatório. */
  readonly controlId: string;
  /** O dia em que o teste aconteceu — `YYYY-MM-DD`, obrigatório. */
  readonly testedOn: string;
  readonly result: TestResult;
  /** Nota do teste — TEXTO LIVRE, OPCIONAL. Pode ser vazia. */
  readonly note: string;
}

/** A entrada crua de um cadastro novo — os campos vêm do formulário. */
export interface NewControlInput {
  readonly name?: unknown;
  readonly description?: unknown;
  readonly controlType?: unknown;
  readonly owner?: unknown;
  readonly frequency?: unknown;
  readonly eriskId?: unknown;
}

/** A entrada crua de um teste novo — os campos vêm do formulário. */
export interface NewTestInput {
  readonly controlId?: unknown;
  readonly testedOn?: unknown;
  readonly result?: unknown;
  readonly note?: unknown;
}

/** Um resumo contável do cadastro. Todo número é `.length`, nunca chute. */
export interface ControlSummary {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
