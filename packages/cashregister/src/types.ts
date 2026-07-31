/**
 * Tipos puros do Módulo 73 — Sessão de Caixa (Vertical Varejo & Supermercados).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a
 * sessão de caixa (o turno físico de uma gaveta) e o seu ciclo (open → closed,
 * o último terminal).
 *
 * ⭐ **O DIVERGE do `cash` (Módulo 14):** o `cash` é o LIVRO-CAIXA CORPORATIVO —
 * lançamentos imutáveis, saldo é view, SEM ciclo de vida. Este módulo é a
 * SESSÃO FÍSICA de uma gaveta: um turno com COMEÇO e FIM. Abre-se contando o
 * fundo de troco, fecha-se contando a gaveta.
 *
 * @see supabase/migrations/0088_cashregister.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-CASHREGISTER-SPEC.md — o fluxo de negócio
 */

/**
 * O estado de uma sessão de caixa.
 *
 * ⭐ `closed` é TERMINAL (a física do `scrum`/`bud`/`proj`): o turno encerrado
 * não reabre; o próximo turno é sessão NOVA.
 */
export type SessionStatus = 'open' | 'closed';

/**
 * Uma sessão de caixa. O operador entra por id solto (opcional — temporário/
 * terceiro não tem cadastro) + nome carimbado pela tela. A contagem de
 * fechamento nasce nula e só existe quando a sessão fecha.
 */
export interface Session {
  readonly id: string;
  /** A gaveta física por NOME em TEXTO LIVRE ("Caixa 1", "PDV Frente"). */
  readonly registerName: string;
  /** Operador por id solto ao hr — nulo quando não há cadastro. */
  readonly operatorId: string | null;
  readonly operatorName: string;
  /** Fundo de troco na abertura (>= 0; gaveta vazia a 0 é honesto). */
  readonly openingAmountCents: number;
  /** Contagem física no fechamento — nula até fechar. */
  readonly closingAmountCents: number | null;
  readonly currency: string;
  readonly status: SessionStatus;
  readonly note: string;
}

/** A abertura da sessão — campos crus da tela, validados antes de virar Session. */
export interface NewSessionInput {
  readonly registerName?: unknown;
  readonly operatorId?: unknown;
  readonly operatorName?: unknown;
  readonly openingAmountCents?: unknown;
  readonly currency?: unknown;
  readonly note?: unknown;
}

/** O fechamento — a contagem física da gaveta (obrigatória, Lei 7). */
export interface CloseSessionInput {
  readonly closingAmountCents?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
