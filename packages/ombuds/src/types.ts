/**
 * Tipos puros do Módulo 91 — Ouvidoria (Lei 13.460).
 *
 * **Domínio puro.** Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a
 * manifestação do cidadão (relato de fato consumado, que nasce IMUTÁVEL) e o seu
 * tratamento (received → under_review → answered/dismissed), com resposta escrita
 * no fim.
 *
 * ⭐⭐ **A física central — o ANONIMATO, reaproveitado do `whistle`.** Quando a
 * manifestação é anônima, o sistema NUNCA registra quem se manifestou:
 * `reporterId` fica `null` para sempre. Não é "não mostra" — é NÃO GRAVA. A única
 * forma de nunca vazar é NUNCA TER. No banco a lei mora em três lugares (o
 * gatilho de inserção descarta `auth.uid()`, a CHECK constraint recusa anônima
 * com cidadão, e a policy de SELECT casa por `reporter_id = auth.uid()` — logo a
 * anônima nem o próprio autor reencontra; ele acompanha pelo `protocol` público).
 *
 * ⭐ **O DIVERGE do `whistle`** (que é GRC, colaborador → má-conduta interna):
 * aqui é cidadão → órgão público. Ganha o `manifestationType` (as 5 naturezas da
 * Lei 13.460, física do método) e o `protocol` público; e os nomes do ciclo
 * falam a língua da Lei 13.460 (received/answered).
 *
 * @see supabase/migrations/0106_ombuds.sql — o schema que sustenta estes tipos
 * @see docs/canon/MODULO-OMBUDS-SPEC.md — o fluxo de negócio
 */

/**
 * ⭐ A natureza da manifestação — as 5 clássicas da Lei 13.460.
 *
 * É FÍSICA DO MÉTODO (a lei define o rol), não vocabulário de casa — por isso é
 * um conjunto fechado (CHECK no banco), a lição do `nps` (0–10) e do `mnt`
 * (corretiva/preventiva). Reclamação, denúncia, sugestão, elogio, informação.
 */
export type ManifestationType =
  | 'complaint'
  | 'report'
  | 'suggestion'
  | 'compliment'
  | 'information';

/** As cinco naturezas, para varredura em testes. */
export const MANIFESTATION_TYPES: readonly ManifestationType[] = [
  'complaint',
  'report',
  'suggestion',
  'compliment',
  'information',
];

/**
 * O estado do TRATAMENTO de uma manifestação.
 *
 * O relato em si nunca muda (fato consumado). Só o tratamento anda:
 * `received → under_review → answered/dismissed`. `answered` e `dismissed` são
 * TERMINAIS, e encerrar exige a resposta escrita. ⭐ Os nomes divergem do
 * `whistle` (open/resolved) para a língua da Lei 13.460 (received/answered).
 */
export type ManifestationStatus = 'received' | 'under_review' | 'answered' | 'dismissed';

/**
 * Uma manifestação. O conteúdo (assunto, descrição, natureza, se é anônima)
 * CONGELA no registro. `reporterId` é `null` quando anônima — para sempre.
 * `protocol` é o carimbo público do servidor (o cidadão anônimo o cita para
 * acompanhar).
 */
export interface Manifestation {
  readonly id: string;
  /** ⭐ O protocolo público — carimbo do servidor; nasce vazio no domínio. */
  readonly protocol: string;
  readonly manifestationType: ManifestationType;
  readonly subject: string;
  readonly description: string;
  /** ⭐⭐ Se `true`, o cidadão NUNCA é gravado — `reporterId` fica `null`. */
  readonly isAnonymous: boolean;
  /**
   * ⭐⭐ O cidadão. `null` para sempre quando anônima (o banco descarta
   * `auth.uid()` no gatilho de inserção; a constraint recusa o contrário).
   */
  readonly reporterId: string | null;
  readonly status: ManifestationStatus;
  /** A resposta escrita — obrigatória ao encerrar (answered/dismissed). */
  readonly response: string;
}

export interface NewManifestationInput {
  readonly manifestationType?: unknown;
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
