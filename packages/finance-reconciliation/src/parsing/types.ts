import type { Cents, CurrencyCode, IsoDate } from '../types.ts';

/**
 * Os tipos da importação de extrato.
 *
 * ⭐ **Por que isto vive em `packages/` e não em `apps/`** (CLAUDE.md §5.3):
 * transformar um arquivo de banco em lançamentos é **regra de negócio** —
 * decide sinal, arredondamento, fuso, o que é duplicata. Se morasse na tela,
 * trocar o Next.js em 2028 levaria junto a interpretação do extrato.
 *
 * A tela faz o que é dela: recebe o arquivo, chama o parser, mostra o preview.
 */

/** Uma linha já normalizada, pronta para virar `recon.statement_lines`. */
export interface ParsedLine {
  readonly lineNo: number;
  readonly postedAt: IsoDate;
  readonly valueDate?: IsoDate | null;
  /** Negativo = saída. Inteiro em centavos — nunca float. */
  readonly amountCents: Cents;
  readonly description: string;
  readonly counterpartyName?: string | null;
  readonly counterpartyTaxId?: string | null;
  /** Id no sistema de origem — FITID do OFX, por exemplo. */
  readonly externalId?: string | null;
  readonly balanceAfterCents?: Cents | null;
}

/**
 * O extrato inteiro, normalizado.
 *
 * Os campos anuláveis são anuláveis de propósito: um CSV cru não traz conta
 * nem moeda, e **inventar** um valor seria pior do que devolver `null` e
 * deixar a tela perguntar. Chutar moeda é viés de país.
 */
export interface ParsedStatement {
  readonly accountRef: string | null;
  readonly currency: CurrencyCode | null;
  readonly periodStart: IsoDate | null;
  readonly periodEnd: IsoDate | null;
  readonly openingBalanceCents?: Cents | null;
  readonly closingBalanceCents?: Cents | null;
  readonly lines: readonly ParsedLine[];
}

/**
 * Erro de leitura de arquivo, com o ponto onde quebrou.
 *
 * Existe para que a tela mostre "linha 14: valor ilegível" em vez de derrubar
 * a página. Arquivo inválido é rotina, não excepcional.
 */
export class StatementParseError extends Error {
  /**
   * Onde o arquivo quebrou.
   *
   * Declarado e atribuído no corpo do construtor, e não como *parameter
   * property* (`constructor(readonly at?: ...)`): o modo de remoção de tipos
   * do Node — que é como os testes rodam, sem compilador — recusa parameter
   * property com `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`. Açúcar de sintaxe que
   * só existe no TypeScript não sobrevive a quem apenas apaga os tipos.
   */
  readonly at?: { readonly line?: number; readonly field?: string };

  constructor(message: string, at?: { readonly line?: number; readonly field?: string }) {
    super(message);
    this.name = 'StatementParseError';
    this.at = at;
  }
}

/** Como interpretar a data quando o formato é ambíguo. */
export type DateOrder = 'DMY' | 'MDY' | 'YMD';

/** Qual coluna do CSV é qual campo — por nome de cabeçalho ou índice (0-based). */
export type ColumnRef = string | number;

/**
 * O mapeamento de colunas de um CSV.
 *
 * ⚠️ **AQUI VIVE A LEI ANTI-VIÉS DESTA ETAPA.**
 *
 * Não existe, e não pode existir, uma lista de bancos suportados no código.
 * Cada empresa usa o banco que usa, e cada banco exporta o CSV que quer. Este
 * objeto vem de `core.tenant_modules.settings.import.csvMapping` — é
 * **configuração do tenant**, não código do produto.
 *
 * O parser sabe ler *um* CSV descrito por este mapa. Ele não sabe o nome de
 * banco nenhum, e é assim que continua servindo o próximo cliente.
 */
export interface CsvMapping {
  /** Separador de campo. `;` é comum onde a vírgula é decimal. */
  readonly delimiter?: string;
  readonly hasHeader: boolean;
  /** Separador decimal do arquivo. */
  readonly decimalSeparator: ',' | '.';
  readonly dateOrder: DateOrder;
  /** Linhas a pular no topo (bancos que põem cabeçalho institucional). */
  readonly skipLines?: number;
  readonly columns: {
    readonly postedAt: ColumnRef;
    readonly description: ColumnRef;
    /** Coluna única com sinal. Use isto **ou** o par `debit`/`credit`. */
    readonly amount?: ColumnRef;
    /** Extratos que separam saída e entrada em duas colunas. */
    readonly debit?: ColumnRef;
    readonly credit?: ColumnRef;
    readonly valueDate?: ColumnRef;
    readonly counterpartyName?: ColumnRef;
    readonly counterpartyTaxId?: ColumnRef;
    readonly externalId?: ColumnRef;
    readonly balanceAfter?: ColumnRef;
  };
}
