/**
 * Tipos puros do Módulo 83 — Monitoramento de Geração.
 *
 * Nem banco, nem rede, nem relógio, nem UI. Só o domínio: a leitura de geração
 * como ATO IMUTÁVEL — quanta energia uma usina gerou, em que unidade e em que
 * período. Não há ciclo de vida (é fato consumado), então não há `Status` nem
 * transição neste módulo. E não há trave: a leitura só narra a medição.
 *
 * ⭐⭐ REAPROVEITA A IDENTIDADE DO `esg` (Módulo 67): na física é a mesma
 * leitura periódica imutável — quantidade + unidade + período. O que muda é o
 * DIVERGE assinado abaixo.
 *
 * ⭐ O DIVERGE — genreading × esg: no `esg` a fonte é OPCIONAL (uma emissão pode
 * não ter obra de origem); aqui a USINA é OBRIGATÓRIA (`plantId` não-nulo),
 * porque não existe geração no ar — toda geração é DE UMA usina. O vínculo
 * continua por ID SOLTO (sem FK cruzada), com o nome carimbado pela tela.
 *
 * ⭐ O MANTIDO do `esg`: `generatedKwh >= 0`. Zero é leitura REAL (à noite a
 * usina gera zero, e recusar isso mentiria sobre o período); negativo é
 * infísico — não se gera -3 kWh.
 *
 * @see supabase/migrations/0098_genreading.sql
 * @see docs/canon/MODULO-GENREADING-SPEC.md
 */

/** Uma leitura de geração. Campos carimbados pelo servidor nascem vazios. */
export interface GenerationReading {
  readonly id: string;
  /**
   * A usina por ID SOLTO — OBRIGATÓRIA (o DIVERGE do esg): não há geração no
   * ar, toda geração é DE UMA usina. Vínculo genérico, sem FK.
   */
  readonly plantId: string;
  /** O nome da usina carimbado pela tela. Pode ser vazio. */
  readonly plantName: string;
  /**
   * A energia gerada. SEMPRE `>= 0`: zero é uma leitura real (à noite a usina
   * gera zero); negativo é infísico. Corrigir é registrar outra leitura, nunca
   * um número negativo.
   */
  readonly generatedKwh: number;
  /**
   * A unidade em TEXTO LIVRE — o tenant escolhe (kWh, MWh). Não-vazia; quando
   * ausente, assume `kWh`.
   */
  readonly unit: string;
  /** A data de referência da leitura — `YYYY-MM-DD`, obrigatória. */
  readonly referenceOn: string;
  /** Nota TEXTO LIVRE, OPCIONAL. */
  readonly note: string;
}

/** A entrada crua de uma leitura nova — os campos vêm do formulário. */
export interface NewReadingInput {
  readonly plantId?: unknown;
  readonly plantName?: unknown;
  readonly generatedKwh?: unknown;
  readonly unit?: unknown;
  readonly referenceOn?: unknown;
  readonly note?: unknown;
}

/**
 * O total gerado POR USINA — soma pura do livro. Cada usina é uma linha, em
 * ordem estável por `plantId`.
 */
export interface PlantGeneration {
  readonly plantId: string;
  readonly totalKwh: number;
  readonly readingCount: number;
}

export interface Problem {
  readonly field: string;
  readonly message: string;
}

export type Validation<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problems: readonly Problem[] };
