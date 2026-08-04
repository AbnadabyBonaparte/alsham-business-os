/**
 * Tipos do Módulo 98 — Profissionais (Vertical Beleza).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐ NÃO reescreve o hr: quando o profissional também é colaborador registrado,
 * o cadastro de gente é do `hr` (Módulo 33) — referenciado aqui por
 * `hrEmployeeId`, ID SOLTO, sem FK, OPCIONAL. O cadeira-alugada autônomo NÃO é
 * empregado do hr, e é por isso que este é um roster PRÓPRIO, não uma projeção
 * do hr. Aqui mora só o nome (neutro), a especialidade (TEXTO LIVRE) e o
 * ciclo de vida `active ↔ archived`.
 *
 * @see supabase/migrations/0113_professional.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-PROFESSIONAL-SPEC.md — o fluxo de negócio
 */

export type ProfessionalStatus = 'active' | 'archived';

export interface Professional {
  readonly id: string;
  /** O nome do profissional — TEXTO LIVRE, neutro. Obrigatório. */
  readonly name: string;
  /** A especialidade — TEXTO LIVRE (cabeleireiro/manicure/esteticista), NUNCA enum. */
  readonly specialty: string;
  /** ID SOLTO ao hr — sem FK, OPCIONAL. O profissional como colaborador. */
  readonly hrEmployeeId: string | null;
  /** active ↔ archived: o profissional volta (o DIVERGE do hr terminal). */
  readonly status: ProfessionalStatus;
}

export interface NewProfessionalInput {
  readonly name?: unknown;
  readonly specialty?: unknown;
  readonly hrEmployeeId?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
