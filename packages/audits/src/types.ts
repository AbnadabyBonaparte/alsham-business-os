/**
 * Tipos puros do Módulo 64 — Auditorias (de qualidade).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a
 * auditoria (o ato de planejar e conduzir uma auditoria de qualidade) e o seu
 * ciclo (`planned → completed/cancelled`, os dois fins TERMINAIS), mais o achado
 * (a observação constatada, IMUTÁVEL).
 *
 * ⭐ **Dois conceitos, dois vínculos de NATUREZA DIFERENTE:** o achado liga-se à
 * auditoria por FK COMPOSTA INTRA-schema (peça do próprio módulo) e ao `nc`
 * (Módulo 63) por ID SOLTO opcional (cross-module, sem FK). É o ponto do módulo.
 *
 * ⚠️ NÃO é a *Auditoria* do Core (a trilha de acesso da plataforma) nem a de GRC
 * (homônimos declarados — Sol Único). Aqui é a auditoria de QUALIDADE.
 *
 * @see supabase/migrations/0079_audit.sql
 * @see docs/canon/MODULO-AUDIT-SPEC.md
 */

/**
 * O estado de uma auditoria.
 *
 * ⭐ `planned → completed`/`cancelled`, os dois fins TERMINAIS (a física do
 * `proj`, Módulo 53): auditoria encerrada não reabre — a próxima é auditoria
 * NOVA. Cancelar exige RAZÃO (a assimetria do `proj`); concluir tem nota
 * opcional.
 */
export type AuditStatus = 'planned' | 'completed' | 'cancelled';

/** Uma auditoria: tipo/escopo em TEXTO LIVRE, data agendada opcional. */
export interface Audit {
  readonly id: string;
  /** Tipo TEXTO LIVRE — "interna/externa/certificação" é dado do tenant, nunca enum. */
  readonly auditType: string;
  /** Escopo TEXTO LIVRE: o que a auditoria abrange. */
  readonly scope: string;
  /** Data agendada (ISO yyyy-mm-dd) ou `null` — auditoria sem data marcada é honesta. */
  readonly scheduledFor: string | null;
  readonly status: AuditStatus;
  /** Razão do cancelamento. Vazia enquanto não cancelada; obrigatória ao cancelar. */
  readonly cancelReason: string;
  /** Nota de desfecho da conclusão. OPCIONAL — pode ser vazia. */
  readonly outcomeNote: string;
}

/**
 * Um achado: a observação constatada numa auditoria.
 *
 * ⭐ IMUTÁVEL (fato constatado, a física da Qualidade): registrar é o único ato;
 * corrigir é registrar outro. O vínculo à auditoria é INTRA-schema (`auditId`,
 * peça do próprio módulo). O vínculo ao `nc` (Módulo 63) é OPCIONAL e por ID
 * SOLTO (`ncEntryId` — sem FK cross-schema): um achado pode virar uma Não
 * Conformidade formal, ou não.
 */
export interface Finding {
  readonly id: string;
  readonly auditId: string;
  readonly description: string;
  /** Vínculo OPCIONAL ao nc por ID SOLTO. `null` quando o achado ainda não virou NC. */
  readonly ncEntryId: string | null;
}

/** A entrada crua de uma auditoria nova — os campos vêm do formulário. */
export interface NewAuditInput {
  readonly auditType?: unknown;
  readonly scope?: unknown;
  readonly scheduledFor?: unknown;
}

/** A entrada crua de um achado novo — auditoria + descrição, nc opcional. */
export interface NewFindingInput {
  readonly auditId?: unknown;
  readonly description?: unknown;
  readonly ncEntryId?: unknown;
}

/** A entrada crua do cancelamento — a razão é OBRIGATÓRIA. */
export interface CancelInput {
  readonly reason?: unknown;
}

/** Um resumo contável das auditorias. Todo número é `.length`, nunca chute. */
export interface AuditSummary {
  readonly total: number;
  readonly planned: number;
  readonly completed: number;
  readonly cancelled: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
