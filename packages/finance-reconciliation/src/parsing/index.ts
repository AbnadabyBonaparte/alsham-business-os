import { parseCsv } from './csv.ts';
import { parseOfx } from './ofx.ts';
import {
  StatementParseError,
  type CsvMapping,
  type ParsedStatement,
} from './types.ts';
import type { StatementSourceFormat } from '../types.ts';

export { parseOfx } from './ofx.ts';
export { parseCsv, splitCsvLine } from './csv.ts';
export {
  parseAmountToCents,
  parseDate,
  parseOfxDate,
  contentHash,
} from './primitives.ts';
export { StatementParseError } from './types.ts';
export type {
  ColumnRef,
  CsvMapping,
  DateOrder,
  ParsedLine,
  ParsedStatement,
} from './types.ts';

/**
 * A porta única da importação: formato + conteúdo → extrato normalizado.
 *
 * A tela chama **isto** e mais nada. Ela não escolhe parser, não conhece OFX,
 * não sabe o que é FITID. Recebe arquivo, entrega preview.
 */
export function parseStatement(
  format: StatementSourceFormat,
  content: string,
  mapping?: CsvMapping,
): ParsedStatement {
  if (format === 'ofx') return parseOfx(content);

  if (format === 'csv') {
    if (!mapping) {
      throw new StatementParseError(
        'este tenant ainda não tem um mapeamento de CSV configurado (settings.import.csvMapping). Sem ele não há como saber qual coluna é qual.',
      );
    }
    return parseCsv(content, mapping);
  }

  // `camt053` e `manual` são valores válidos no schema, mas o leitor não
  // existe. Dizer isso é melhor do que tentar e falhar torto (Lei 7).
  throw new StatementParseError(`o formato "${format}" ainda não tem leitor construído.`);
}
