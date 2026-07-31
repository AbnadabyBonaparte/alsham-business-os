/**
 * Tipos puros do Módulo 77 — Canal de Denúncias.
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a
 * denúncia (relato de fato consumado, que nasce IMUTÁVEL) e o seu tratamento
 * (open → under_review → resolved/dismissed), com desfecho escrito no fim.
 *
 * ⭐⭐ **A física central — o ANONIMATO.** Quando a denúncia é anônima, o sistema
 * NUNCA registra quem denunciou: `reporterId` fica `null` para sempre. Não é
 * "não mostra" — é NÃO GRAVA. A única forma de nunca vazar é NUNCA TER. No banco
 * a lei mora em três lugares (o gatilho de inserção descarta `auth.uid()`, a
 * CHECK constraint recusa anônima com denunciante, e a policy de SELECT casa por
 * `reporter_id = auth.uid()` — logo a anônima nem o próprio autor reencontra).
 *
 * @see supabase/migrations/0092_whistle.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-WHISTLE-SPEC.md — o fluxo de negócio
 */

/**
 * O estado do TRATAMENTO de uma denúncia.
 *
 * O relato em si nunca muda (fato consumado). Só o tratamento anda:
 * `open → under_review → resolved/dismissed`. `resolved` e `dismissed` são
 * TERMINAIS, e encerrar exige o desfecho escrito.
 */
export type ReportStatus = 'open' | 'under_review' | 'resolved' | 'dismissed';

/**
 * Uma denúncia. O conteúdo (assunto, descrição, categoria, se é anônima)
 * CONGELA no registro. `reporterId` é `null` quando anônima — para sempre.
 */
export interface WhistleReport {
  readonly id: string;
  /** Categoria em texto livre (dado do tenant); opcional — nasce vazia. */
  readonly category: string;
  readonly subject: string;
  readonly description: string;
  /** ⭐⭐ Se `true`, o denunciante NUNCA é gravado — `reporterId` fica `null`. */
  readonly isAnonymous: boolean;
  /**
   * ⭐⭐ O denunciante. `null` para sempre quando anônima (o banco descarta
   * `auth.uid()` no gatilho de inserção; a constraint recusa o contrário).
   */
  readonly reporterId: string | null;
  readonly status: ReportStatus;
  /** O desfecho escrito — obrigatório ao encerrar (resolved/dismissed). */
  readonly resolution: string;
}

export interface NewReportInput {
  readonly category?: unknown;
  readonly subject?: unknown;
  readonly description?: unknown;
  readonly isAnonymous?: unknown;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
