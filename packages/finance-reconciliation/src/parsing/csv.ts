import { parseAmountToCents, parseDate } from './primitives.ts';
import {
  StatementParseError,
  type ColumnRef,
  type CsvMapping,
  type ParsedLine,
  type ParsedStatement,
} from './types.ts';

/**
 * Leitor de CSV **descrito pelo tenant**.
 *
 * ⚠️ Este arquivo não conhece banco nenhum, e não pode conhecer. Ele lê *um*
 * CSV cujo formato é descrito por `CsvMapping`, que vem de
 * `core.tenant_modules.settings.import.csvMapping`.
 *
 * Uma tabela de bancos homologados aqui dentro seria o sistema de um cliente
 * — e é exatamente o que a Lei anti-viés proíbe. O próximo cliente traz outro
 * layout, e o produto atende sem uma linha de código nova.
 */

/**
 * Divide uma linha de CSV respeitando aspas e aspas escapadas (`""`).
 *
 * Escrito à mão de propósito: `split(delimiter)` quebra em qualquer descrição
 * que contenha o separador — e descrição de extrato contém, o tempo todo.
 */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** Resolve uma coluna por índice (0-based) ou por nome de cabeçalho. */
function cell(
  row: readonly string[],
  header: readonly string[] | null,
  ref: ColumnRef | undefined,
): string | null {
  if (ref === undefined) return null;

  if (typeof ref === 'number') {
    return row[ref] ?? null;
  }
  if (!header) {
    throw new StatementParseError(
      `o mapeamento cita a coluna "${ref}" por nome, mas o arquivo foi declarado sem cabeçalho (hasHeader: false).`,
    );
  }
  const want = ref.trim().toLowerCase();
  const idx = header.findIndex((h) => h.trim().toLowerCase() === want);
  if (idx === -1) {
    throw new StatementParseError(
      `coluna "${ref}" não encontrada no cabeçalho do arquivo. Colunas presentes: ${header.join(', ')}`,
    );
  }
  return row[idx] ?? null;
}

const blank = (v: string | null): boolean => v === null || v.trim() === '';

export function parseCsv(content: string, mapping: CsvMapping): ParsedStatement {
  const delimiter = mapping.delimiter ?? ',';

  if (mapping.columns.amount === undefined &&
      mapping.columns.debit === undefined &&
      mapping.columns.credit === undefined) {
    throw new StatementParseError(
      'o mapeamento não diz onde está o valor: configure `amount`, ou o par `debit`/`credit`.',
    );
  }

  const all = content
    .split(/\r\n|\n|\r/)
    .slice(mapping.skipLines ?? 0)
    .filter((l) => l.trim() !== '');

  if (all.length === 0) throw new StatementParseError('arquivo vazio.');

  const header = mapping.hasHeader ? splitCsvLine(all[0] as string, delimiter) : null;
  const body = mapping.hasHeader ? all.slice(1) : all;

  if (body.length === 0) {
    throw new StatementParseError('o arquivo tem cabeçalho, mas nenhuma linha de lançamento.');
  }

  const lines: ParsedLine[] = [];

  body.forEach((rawLine, i) => {
    // O número que aparece na mensagem de erro é o da LINHA DO ARQUIVO, para
    // a pessoa achar o problema no editor dela — não o índice interno.
    const fileLine = i + 1 + (mapping.skipLines ?? 0) + (mapping.hasHeader ? 1 : 0);
    const at = { line: fileLine };
    const row = splitCsvLine(rawLine, delimiter);

    const dateRaw = cell(row, header, mapping.columns.postedAt);
    if (blank(dateRaw)) {
      throw new StatementParseError('linha sem data', { ...at, field: 'postedAt' });
    }

    let amountCents: number;
    if (mapping.columns.amount !== undefined) {
      const raw = cell(row, header, mapping.columns.amount);
      if (blank(raw)) throw new StatementParseError('linha sem valor', { ...at, field: 'amount' });
      amountCents = parseAmountToCents(raw as string, mapping.decimalSeparator, {
        ...at,
        field: 'amount',
      });
    } else {
      // Extratos que separam saída e entrada em duas colunas. O débito entra
      // como NEGATIVO — o sinal é do domínio, não do arquivo.
      const debitRaw = cell(row, header, mapping.columns.debit);
      const creditRaw = cell(row, header, mapping.columns.credit);
      const debit = blank(debitRaw)
        ? 0
        : Math.abs(parseAmountToCents(debitRaw as string, mapping.decimalSeparator, { ...at, field: 'debit' }));
      const credit = blank(creditRaw)
        ? 0
        : Math.abs(parseAmountToCents(creditRaw as string, mapping.decimalSeparator, { ...at, field: 'credit' }));

      if (debit === 0 && credit === 0) {
        throw new StatementParseError('linha sem valor em débito nem em crédito', at);
      }
      if (debit !== 0 && credit !== 0) {
        throw new StatementParseError(
          'linha com valor em débito E em crédito ao mesmo tempo — o arquivo é ambíguo',
          at,
        );
      }
      amountCents = debit !== 0 ? -debit : credit;
    }

    const valueDateRaw = cell(row, header, mapping.columns.valueDate);
    const balanceRaw = cell(row, header, mapping.columns.balanceAfter);
    const descr = cell(row, header, mapping.columns.description);

    lines.push({
      lineNo: lines.length + 1,
      postedAt: parseDate(dateRaw as string, mapping.dateOrder, { ...at, field: 'postedAt' }),
      valueDate: blank(valueDateRaw)
        ? null
        : parseDate(valueDateRaw as string, mapping.dateOrder, { ...at, field: 'valueDate' }),
      amountCents,
      description: descr ?? '',
      counterpartyName: cell(row, header, mapping.columns.counterpartyName) || null,
      counterpartyTaxId: cell(row, header, mapping.columns.counterpartyTaxId) || null,
      externalId: cell(row, header, mapping.columns.externalId) || null,
      balanceAfterCents: blank(balanceRaw)
        ? null
        : parseAmountToCents(balanceRaw as string, mapping.decimalSeparator, {
            ...at,
            field: 'balanceAfter',
          }),
    });
  });

  const dates = lines.map((l) => l.postedAt).sort();

  return {
    // CSV cru não traz conta nem moeda. Devolver `null` e deixar a tela
    // perguntar é honesto; presumir a moeda do país seria viés.
    accountRef: null,
    currency: null,
    periodStart: dates[0] ?? null,
    periodEnd: dates[dates.length - 1] ?? null,
    openingBalanceCents: null,
    closingBalanceCents: null,
    lines,
  };
}
