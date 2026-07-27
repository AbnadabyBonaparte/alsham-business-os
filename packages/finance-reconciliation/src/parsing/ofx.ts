import { parseAmountToCents, parseOfxDate } from './primitives.ts';
import {
  StatementParseError,
  type ParsedLine,
  type ParsedStatement,
} from './types.ts';

/**
 * Leitor de OFX — **padrão aberto**, e é por isso que ele pode ser código.
 *
 * O OFX é SGML: tags que muitas vezes não fecham. Por isso não se usa parser
 * de XML aqui; lê-se tag a tag até o fim da linha, que é como o formato
 * realmente se comporta em arquivo de banco de verdade.
 *
 * Este arquivo não sabe o nome de banco nenhum. Se soubesse, seria o sistema
 * de um cliente (Lei anti-viés).
 */

/** Lê `<TAG>valor` (SGML, sem fechamento) ou `<TAG>valor</TAG>`. */
function tag(block: string, name: string): string | null {
  const re = new RegExp(`<${name}>\\s*([^<\\r\\n]*)`, 'i');
  const m = re.exec(block);
  const v = m?.[1]?.trim();
  return v ? v : null;
}

/**
 * O separador decimal do OFX é `.` por especificação — mas arquivo real
 * aparece com `,`. Detectar aqui é seguro porque o OFX **não usa separador
 * de milhar**: só pode haver um separador, e ele é o decimal.
 *
 * Em CSV essa detecção seria perigosa (`1.250` é ambíguo) e por isso lá o
 * separador vem do mapeamento do tenant, nunca de palpite.
 */
function ofxDecimalSeparator(raw: string): ',' | '.' {
  return raw.includes(',') ? ',' : '.';
}

export function parseOfx(content: string): ParsedStatement {
  if (!/<OFX>/i.test(content) && !/<STMTTRN>/i.test(content)) {
    throw new StatementParseError(
      'este arquivo não parece um OFX (nenhuma marca <OFX> ou <STMTTRN> encontrada).',
    );
  }

  const blocks = content.split(/<STMTTRN>/i).slice(1);
  if (blocks.length === 0) {
    throw new StatementParseError('OFX sem nenhuma transação (<STMTTRN>).');
  }

  const lines: ParsedLine[] = [];
  blocks.forEach((raw, i) => {
    const block = raw.split(/<\/STMTTRN>/i)[0] ?? raw;
    const at = { line: i + 1, field: 'STMTTRN' };

    const amountRaw = tag(block, 'TRNAMT');
    const dateRaw = tag(block, 'DTPOSTED');
    if (!amountRaw) throw new StatementParseError('transação sem <TRNAMT>', at);
    if (!dateRaw) throw new StatementParseError('transação sem <DTPOSTED>', at);

    const memo = tag(block, 'MEMO');
    const name = tag(block, 'NAME');
    const type = tag(block, 'TRNTYPE');

    lines.push({
      lineNo: i + 1,
      postedAt: parseOfxDate(dateRaw, at),
      valueDate: (() => {
        const d = tag(block, 'DTAVAIL');
        return d ? parseOfxDate(d, at) : null;
      })(),
      // O sinal vem do próprio TRNAMT: no OFX, débito já é negativo.
      amountCents: parseAmountToCents(amountRaw, ofxDecimalSeparator(amountRaw), at),
      // MEMO é a descrição; NAME costuma ser a contraparte. Quando só há um
      // dos dois, usa-se o que existir — e o TRNTYPE é o último recurso, para
      // a linha nunca ficar sem rótulo na tela.
      description: memo ?? name ?? type ?? '',
      counterpartyName: name ?? null,
      // OFX não carrega identificador fiscal da contraparte.
      counterpartyTaxId: null,
      externalId: tag(block, 'FITID'),
      balanceAfterCents: null,
    });
  });

  const header = content.split(/<STMTTRN>/i)[0] ?? '';
  const balRaw = tag(content, 'BALAMT');
  const dtStart = tag(header, 'DTSTART');
  const dtEnd = tag(header, 'DTEND');

  return {
    accountRef: tag(header, 'ACCTID'),
    currency: tag(header, 'CURDEF')?.toUpperCase() ?? null,
    // Sem DTSTART/DTEND, o período é o que as próprias transações cobrem —
    // derivado do arquivo, nunca inventado.
    periodStart: dtStart
      ? parseOfxDate(dtStart)
      : (lines.reduce<string | null>((min, l) => (!min || l.postedAt < min ? l.postedAt : min), null)),
    periodEnd: dtEnd
      ? parseOfxDate(dtEnd)
      : (lines.reduce<string | null>((max, l) => (!max || l.postedAt > max ? l.postedAt : max), null)),
    openingBalanceCents: null,
    closingBalanceCents: balRaw
      ? parseAmountToCents(balRaw, ofxDecimalSeparator(balRaw))
      : null,
    lines,
  };
}
