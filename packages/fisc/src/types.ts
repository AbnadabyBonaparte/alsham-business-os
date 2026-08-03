/**
 * Tipos do Módulo 93 — Fiscalização (Vertical Governo).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI.
 *
 * ⭐⭐ A decisão de desenho: este módulo tem DUAS peças, com físicas opostas —
 * e é EXATAMENTE a física do `sec` (Segurança/Rondas) re-perguntada para a
 * fiscalização pública. O `occ` (Ocorrências) pressupõe que o alvo já existe
 * em outro lugar; a fiscalização municipal trabalha ao contrário: mantém um
 * ROL de estabelecimentos/imóveis sob jurisdição que são vistoriados
 * periodicamente. Isso é roster + livro de campo — a física do `sec`.
 *
 * O `Target` (alvo fiscalizável) é DESENHO DO TENANT — texto livre, volta do
 * arquivo (física do `sec`/`mall`: o mesmo alvo reativado é o mesmo alvo).
 *
 * O `Inspection` (a vistoria) é um ATO PONTUAL — nasce pronto, carimbado pelo
 * servidor, e NUNCA MUDA. Não tem `status`, não tem ciclo de vida: a vistoria
 * apenas CONSTATA. ⛔ O auto de infração (a penalidade com força de lei) é
 * FORA (Lei 3) — não existe tipo para ele aqui.
 *
 * @see supabase/migrations/0108_fisc.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-FISC-SPEC.md — o fluxo de negócio
 */

export type TargetStatus = 'active' | 'archived';

export interface Target {
  readonly id: string;
  /** TEXTO LIVRE — o vocabulário de cada órgão ("Padaria da Praça, Lote 12"). */
  readonly name: string;
  /** `archived → active` existe: o alvo é o ESTABELECIMENTO, e ele volta. */
  readonly status: TargetStatus;
}

export interface NewTargetInput {
  readonly name?: unknown;
}

/**
 * A vistoria — ⭐⭐ SEM `status`, por desenho: não tem ciclo de vida, porque
 * não é um pedido que se resolve nem um fato que se apura em cadeia (isso é o
 * `occ`) — é o que o fiscal CONSTATOU em campo, ato consumado desde o instante
 * em que nasce. ⛔ O auto de infração (penalidade) é FORA (Lei 3).
 */
export interface Inspection {
  readonly id: string;
  readonly targetId: string;
  readonly targetName: string;
  /** ⭐ Carimbado pelo SERVIDOR — a hora do formulário é descartada. */
  readonly inspectedAt: string;
  /** O que a vistoria constatou — texto livre, pode ser vazio. */
  readonly finding: string;
}

export interface NewInspectionInput {
  readonly targetId?: unknown;
  readonly finding?: unknown;
}

export interface NewInspection {
  readonly targetId: string;
  readonly finding: string;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
