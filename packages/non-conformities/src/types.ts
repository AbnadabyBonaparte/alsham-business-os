/**
 * Tipos puros do Módulo 63 — Não Conformidades.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a
 * não conformidade (o desvio constatado, registro imutável) e o seu ciclo
 * (`open → closed`, terminal).
 *
 * ⭐ **Abre o Domain 🧪 Qualidade** — território novo do mapa (Taxonomia §5,
 * capacidade *Não conformidades*).
 *
 * ⭐ **A identidade é a do `occ` (Módulo 16), re-perguntada:** uma NC é um FATO
 * CONSTATADO — um desvio observado numa auditoria, numa reclamação, numa
 * inspeção. Como a ocorrência, o registro NASCE IMUTÁVEL: reescrever o desvio
 * é reescrever a apuração. Recorrência é NC NOVA (por `previousEntryId` solto),
 * nunca reabertura.
 *
 * ⭐⭐ **O DIVERGE do `occ`:** o `occ` encerra com um DESFECHO livre (o que
 * aconteceu); a NC fecha com uma **NOTA DE VERIFICAÇÃO** — QUEM CONFERIU que a
 * causa foi corrigida. Fechar sem verificar é arquivar sem conferir, e é o
 * pecado que a norma persegue.
 *
 * @see supabase/migrations/0078_nc.sql
 * @see docs/canon/MODULO-NC-SPEC.md
 */

/**
 * O estado de uma não conformidade.
 *
 * ⭐ `open → closed` (terminal — a física do `occ`): o desvio foi constatado UMA
 * vez; não há "reabrir" — recorrência é NC nova, referenciando a antiga por id
 * solto (`previousEntryId`).
 */
export type NcStatus = 'open' | 'closed';

/** Uma não conformidade: o registro imutável do desvio constatado. */
export interface Entry {
  readonly id: string;
  /**
   * Origem TEXTO LIVRE: "auditoria interna", "reclamação de cliente",
   * "inspeção de recebimento". Nunca um enum — a fonte de um laboratório não é
   * a de uma construtora.
   */
  readonly origin: string;
  /** A descrição do desvio constatado. Obrigatória. */
  readonly description: string;
  /** Causa raiz TEXTO LIVRE, opcional — `''` quando ausente. */
  readonly rootCause: string;
  /**
   * Vínculo OPCIONAL a uma ação corretiva do `capa` (Módulo 65) por ID SOLTO —
   * sem FK cross-schema. `null` quando ainda não há CAPA.
   */
  readonly capaActionId: string | null;
  /**
   * Recorrência: a NC que reabre é NOVA e aponta a antiga por ID SOLTO. `null`
   * quando não há antecedente.
   */
  readonly previousEntryId: string | null;
  readonly status: NcStatus;
  /**
   * ⭐⭐ O DIVERGE do `occ`: a NOTA DE VERIFICAÇÃO carimbada no fechamento —
   * quem conferiu que a causa foi corrigida. `''` enquanto a NC está aberta.
   */
  readonly verificationNote: string;
}

/** A entrada crua de uma NC nova — os campos vêm do formulário. */
export interface NewEntryInput {
  readonly origin?: unknown;
  readonly description?: unknown;
  readonly rootCause?: unknown;
  readonly capaActionId?: unknown;
  readonly previousEntryId?: unknown;
}

/** A entrada crua do fechamento — ⭐⭐ a nota de verificação é o DIVERGE. */
export interface ClosureInput {
  readonly verificationNote?: unknown;
}

/** Um resumo contável das NCs. Todo número é `.length`, nunca chute. */
export interface EntrySummary {
  readonly total: number;
  readonly open: number;
  readonly closed: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
