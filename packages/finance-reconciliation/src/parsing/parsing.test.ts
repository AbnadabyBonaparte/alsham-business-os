import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  contentHash,
  parseAmountToCents,
  parseCsv,
  parseDate,
  parseOfx,
  parseOfxDate,
  parseStatement,
  splitCsvLine,
  StatementParseError,
} from './index.ts';
import type { CsvMapping } from './index.ts';

/**
 * Testes da importação de extrato.
 *
 * ⚠️ Todo dado aqui é fabricado. Nenhum arquivo, banco, CNPJ ou fornecedor
 * real — Lei anti-viés vale para fixture (e para arquivo de exemplo, que é
 * onde dado real costuma vazar sem ninguém notar).
 */

describe('valor → centavos', () => {
  test('as formas que extrato de banco realmente usa', () => {
    assert.equal(parseAmountToCents('1.234,56', ','), 123456);
    assert.equal(parseAmountToCents('1,234.56', '.'), 123456);
    assert.equal(parseAmountToCents('-1250.00', '.'), -125000);
    assert.equal(parseAmountToCents('1250,00-', ','), -125000);
    assert.equal(parseAmountToCents('(1.250,00)', ','), -125000);
    assert.equal(parseAmountToCents('R$ 1.250,00', ','), 125000);
    assert.equal(parseAmountToCents('+890.5', '.'), 89050);
    assert.equal(parseAmountToCents('0,01', ','), 1);
  });

  test('nunca passa por float — 0,1 + 0,2 não vira 0,30000000000000004', () => {
    const soma = parseAmountToCents('0,10', ',') + parseAmountToCents('0,20', ',');
    assert.equal(soma, 30);
    assert.ok(Number.isSafeInteger(soma));
  });

  test('o separador decimal NÃO é adivinhado — é do mapeamento do tenant', () => {
    // O mesmo texto vale coisas diferentes conforme o país que exportou.
    // Adivinhar aqui é como se perdem três casas em silêncio.
    assert.equal(parseAmountToCents('1.250', ','), 125000, 'com vírgula decimal: mil duzentos e cinquenta');
    assert.equal(parseAmountToCents('1.250', '.'), 125, 'com ponto decimal: um e vinte e cinco');
  });

  test('casa decimal a mais: zero passa, valor recusa', () => {
    // `1.250` cabe em centavos sem perda — a terceira casa é zero.
    assert.equal(parseAmountToCents('1.250', '.'), 125);
    assert.equal(parseAmountToCents('1,2500', ','), 125);
    // `10,555` exigiria arredondar. É assim que centavo some sem ninguém ver.
    assert.throws(() => parseAmountToCents('10,555', ','), StatementParseError);
  });

  test('zero à direita não come o centavo', () => {
    assert.equal(parseAmountToCents('0,01', ','), 1, 'não pode virar 0');
    assert.equal(parseAmountToCents('0,10', ','), 10);
  });

  test('lixo é erro com o texto original na mensagem', () => {
    assert.throws(() => parseAmountToCents('', ','), StatementParseError);
    assert.throws(() => parseAmountToCents('abc', ','), StatementParseError);
    assert.throws(() => parseAmountToCents('1,2,3', ','), StatementParseError);
  });
});

describe('data', () => {
  test('a ordem vem do mapeamento — 03/04 é abril ou março conforme o país', () => {
    assert.equal(parseDate('03/04/2026', 'DMY'), '2026-04-03');
    assert.equal(parseDate('03/04/2026', 'MDY'), '2026-03-04');
    assert.equal(parseDate('2026-04-03', 'YMD'), '2026-04-03');
  });

  test('ano de dois dígitos tem janela explícita', () => {
    assert.equal(parseDate('03/04/26', 'DMY'), '2026-04-03');
    assert.equal(parseDate('03/04/98', 'DMY'), '1998-04-03');
  });

  test('31/02 dói aqui — não vira 03/03 em silêncio', () => {
    assert.throws(() => parseDate('31/02/2026', 'DMY'), StatementParseError);
    assert.throws(() => parseDate('00/01/2026', 'DMY'), StatementParseError);
  });

  test('OFX fica só com o dia — a hora do banco não muda o dia da conciliação', () => {
    assert.equal(parseOfxDate('20260710'), '2026-07-10');
    assert.equal(parseOfxDate('20260710120000'), '2026-07-10');
    assert.equal(parseOfxDate('20260710235959.000[-3:BRT]'), '2026-07-10');
  });
});

describe('CSV — divisão de linha', () => {
  test('respeita aspas: descrição com o separador dentro não quebra a linha', () => {
    assert.deepEqual(
      splitCsvLine('10/07/2026,"PAGTO ALFA, PARCELA 2",-125.00', ','),
      ['10/07/2026', 'PAGTO ALFA, PARCELA 2', '-125.00'],
    );
  });

  test('aspas escapadas', () => {
    assert.deepEqual(splitCsvLine('a,"diz ""oi""",b', ','), ['a', 'diz "oi"', 'b']);
  });

  test('outro delimitador', () => {
    assert.deepEqual(splitCsvLine('a;b;c', ';'), ['a', 'b', 'c']);
  });
});

/** Um layout fictício. Na vida real vem de `tenant_modules.settings`. */
const MAPPING: CsvMapping = {
  delimiter: ';',
  hasHeader: true,
  decimalSeparator: ',',
  dateOrder: 'DMY',
  columns: {
    postedAt: 'Data',
    description: 'Historico',
    amount: 'Valor',
    counterpartyName: 'Contraparte',
    externalId: 'Documento',
  },
};

const CSV = [
  'Data;Historico;Valor;Contraparte;Documento',
  '08/07/2026;PAGTO NF-2041;-1.250,00;Fornecedor Alfa Ltda;DOC-1',
  '11/07/2026;TED FORNECEDOR;-3.480,50;Fornecedor Beta SA;DOC-2',
  '18/07/2026;CREDITO RECEBIMENTO;4.500,00;;DOC-3',
].join('\n');

describe('CSV — leitura', () => {
  test('lê o arquivo descrito pelo mapeamento', () => {
    const st = parseCsv(CSV, MAPPING);
    assert.equal(st.lines.length, 3);
    assert.equal(st.lines[0]?.amountCents, -125000);
    assert.equal(st.lines[0]?.postedAt, '2026-07-08');
    assert.equal(st.lines[0]?.counterpartyName, 'Fornecedor Alfa Ltda');
    assert.equal(st.lines[2]?.amountCents, 450000);
    assert.equal(st.lines[2]?.counterpartyName, null, 'campo vazio vira null, não string vazia');
    assert.equal(st.periodStart, '2026-07-08');
    assert.equal(st.periodEnd, '2026-07-18');
  });

  test('não inventa conta nem moeda — CSV cru não tem essa informação', () => {
    const st = parseCsv(CSV, MAPPING);
    assert.equal(st.accountRef, null);
    assert.equal(st.currency, null, 'presumir a moeda do país seria viés');
  });

  test('o MESMO arquivo com outro mapeamento dá outro resultado', () => {
    // A prova de que o layout é configuração, não código: nenhum banco está
    // embutido no parser.
    const porIndice = parseCsv(CSV, {
      ...MAPPING,
      hasHeader: true,
      columns: { postedAt: 0, description: 1, amount: 2 },
    });
    assert.equal(porIndice.lines.length, 3);
    assert.equal(porIndice.lines[0]?.amountCents, -125000);
    assert.equal(porIndice.lines[0]?.counterpartyName, null, 'não mapeou contraparte: não lê');
  });

  test('colunas separadas de débito e crédito — débito entra negativo', () => {
    const csv = [
      'Data;Historico;Debito;Credito',
      '08/07/2026;SAIDA;1.250,00;',
      '09/07/2026;ENTRADA;;900,00',
    ].join('\n');
    const st = parseCsv(csv, {
      delimiter: ';',
      hasHeader: true,
      decimalSeparator: ',',
      dateOrder: 'DMY',
      columns: { postedAt: 'Data', description: 'Historico', debit: 'Debito', credit: 'Credito' },
    });
    assert.equal(st.lines[0]?.amountCents, -125000, 'o sinal é do domínio, não do arquivo');
    assert.equal(st.lines[1]?.amountCents, 90000);
  });

  test('linha com débito E crédito é ambígua — recusa em vez de escolher', () => {
    const csv = ['Data;H;D;C', '08/07/2026;X;10,00;20,00'].join('\n');
    assert.throws(
      () => parseCsv(csv, {
        delimiter: ';', hasHeader: true, decimalSeparator: ',', dateOrder: 'DMY',
        columns: { postedAt: 'Data', description: 'H', debit: 'D', credit: 'C' },
      }),
      StatementParseError,
    );
  });

  test('o erro aponta a LINHA DO ARQUIVO, para a pessoa achar no editor', () => {
    const csv = [
      'Data;Historico;Valor',
      '08/07/2026;OK;-10,00',
      '99/99/2026;QUEBRADA;-10,00',
    ].join('\n');
    try {
      parseCsv(csv, { ...MAPPING, columns: { postedAt: 'Data', description: 'Historico', amount: 'Valor' } });
      assert.fail('deveria ter lançado');
    } catch (err) {
      assert.ok(err instanceof StatementParseError);
      assert.equal(err.at?.line, 3, 'linha 3 do arquivo: cabeçalho + 2 lançamentos');
    }
  });

  test('coluna citada que não existe diz quais existem', () => {
    try {
      parseCsv(CSV, { ...MAPPING, columns: { ...MAPPING.columns, postedAt: 'DataQueNaoExiste' } });
      assert.fail('deveria ter lançado');
    } catch (err) {
      assert.ok(err instanceof StatementParseError);
      assert.match(err.message, /Colunas presentes/);
    }
  });

  test('mapeamento sem valor nenhum é recusado', () => {
    assert.throws(
      () => parseCsv(CSV, { ...MAPPING, columns: { postedAt: 'Data', description: 'Historico' } }),
      StatementParseError,
    );
  });

  test('arquivo vazio e só-cabeçalho são erros com mensagem', () => {
    assert.throws(() => parseCsv('', MAPPING), StatementParseError);
    assert.throws(() => parseCsv('Data;Historico;Valor', MAPPING), StatementParseError);
  });
});

const OFX = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><ACCTID>0001-99999<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260701<DTEND>20260731
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260708120000[-3:BRT]
<TRNAMT>-1250.00
<FITID>FIT-0001
<NAME>FORNECEDOR ALFA LTDA
<MEMO>PAGTO NF-2041
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260718
<TRNAMT>4500.00
<FITID>FIT-0002
<MEMO>CREDITO RECEBIMENTO
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>15000.00<DTASOF>20260731</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

describe('OFX — leitura', () => {
  test('lê transações, conta, moeda e período do cabeçalho', () => {
    const st = parseOfx(OFX);
    assert.equal(st.lines.length, 2);
    assert.equal(st.currency, 'BRL');
    assert.equal(st.accountRef, '0001-99999');
    assert.equal(st.periodStart, '2026-07-01');
    assert.equal(st.periodEnd, '2026-07-31');
    assert.equal(st.closingBalanceCents, 1500000);
  });

  test('o sinal vem do TRNAMT — no OFX o débito já é negativo', () => {
    const st = parseOfx(OFX);
    assert.equal(st.lines[0]?.amountCents, -125000);
    assert.equal(st.lines[1]?.amountCents, 450000);
  });

  test('MEMO vira descrição, NAME vira contraparte, FITID vira id externo', () => {
    const st = parseOfx(OFX);
    assert.equal(st.lines[0]?.description, 'PAGTO NF-2041');
    assert.equal(st.lines[0]?.counterpartyName, 'FORNECEDOR ALFA LTDA');
    assert.equal(st.lines[0]?.externalId, 'FIT-0001');
  });

  test('sem MEMO, cai para NAME — a linha nunca fica sem rótulo', () => {
    const st = parseOfx(OFX.replace('<MEMO>CREDITO RECEBIMENTO', '<X>'));
    assert.equal(st.lines[1]?.description, 'CREDIT', 'último recurso: o TRNTYPE');
  });

  test('OFX com vírgula decimal — arquivo real foge da especificação', () => {
    const st = parseOfx(OFX.replace('<TRNAMT>-1250.00', '<TRNAMT>-1250,00'));
    assert.equal(st.lines[0]?.amountCents, -125000);
  });

  test('sem DTSTART/DTEND, o período é derivado das transações', () => {
    const st = parseOfx(OFX.replace('<DTSTART>20260701<DTEND>20260731', ''));
    assert.equal(st.periodStart, '2026-07-08');
    assert.equal(st.periodEnd, '2026-07-18');
  });

  test('arquivo que não é OFX é recusado com mensagem, não com crash', () => {
    assert.throws(() => parseOfx('isto aqui é um texto qualquer'), StatementParseError);
  });

  test('transação sem valor ou sem data aponta qual', () => {
    assert.throws(
      () => parseOfx('<OFX><STMTTRN><DTPOSTED>20260708<FITID>X</STMTTRN></OFX>'),
      /TRNAMT/,
    );
    assert.throws(
      () => parseOfx('<OFX><STMTTRN><TRNAMT>-1.00<FITID>X</STMTTRN></OFX>'),
      /DTPOSTED/,
    );
  });
});

describe('parseStatement — a porta única', () => {
  test('despacha por formato', () => {
    assert.equal(parseStatement('ofx', OFX).lines.length, 2);
    assert.equal(parseStatement('csv', CSV, MAPPING).lines.length, 3);
  });

  test('CSV sem mapeamento do tenant diz exatamente o que falta configurar', () => {
    assert.throws(() => parseStatement('csv', CSV), /csvMapping/);
  });

  test('formato sem leitor construído admite que não existe (Lei 7)', () => {
    assert.throws(() => parseStatement('camt053', ''), /ainda não tem leitor construído/);
  });
});

describe('impressão digital do arquivo', () => {
  test('mesmo conteúdo, mesmo hash — é o que impede reimportar', () => {
    return Promise.all([contentHash(CSV), contentHash(CSV)]).then(([a, b]) => {
      assert.equal(a, b);
      assert.equal(a.length, 64, 'SHA-256 em hexadecimal');
    });
  });

  test('um caractere diferente muda o hash', async () => {
    const a = await contentHash(CSV);
    const b = await contentHash(`${CSV}\n`);
    assert.notEqual(a, b);
  });
});
