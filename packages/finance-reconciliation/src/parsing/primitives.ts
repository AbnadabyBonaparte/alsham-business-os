import type { Cents, IsoDate } from '../types.ts';
import { StatementParseError, type DateOrder } from './types.ts';

/**
 * Os primitivos da importação: dinheiro e data.
 *
 * São as duas coisas que todo extrato erra de um jeito diferente, e as duas
 * que não podem estar erradas. Ficam isoladas aqui porque é o que se testa
 * exaustivamente sem precisar de arquivo nenhum.
 */

/**
 * Texto de valor → **centavos inteiros**.
 *
 * Nunca passa por `float`: `parseFloat('0.1') + parseFloat('0.2')` não é `0.3`,
 * e num extrato isso vira centavo perdido que ninguém encontra. O caminho é
 * texto → dígitos → inteiro.
 *
 * Aceita as formas que extrato de banco realmente usa:
 * `1.234,56` · `1,234.56` · `-1250.00` · `1250.00-` · `(1.250,00)` · `R$ 1.250,00`
 *
 * O separador decimal vem do mapeamento do tenant — **não é adivinhado**.
 * Adivinhar em `1.250` (mil e duzentos e cinquenta? ou um e vinte e cinco?)
 * é como se perde três casas em silêncio.
 */
export function parseAmountToCents(
  raw: string,
  decimalSeparator: ',' | '.',
  at?: { line?: number; field?: string },
): Cents {
  const original = raw ?? '';
  let s = original.trim();
  if (s === '') throw new StatementParseError('valor vazio', at);

  // Negativo por parênteses — convenção contábil.
  let negative = /^\(.*\)$/.test(s);
  if (negative) s = s.slice(1, -1).trim();

  // Sinal antes ou depois; extrato de banco usa os dois.
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }

  // Fora símbolo de moeda, espaço fino e espaço comum.
  s = s.replace(/[^\d.,]/g, '').trim();
  if (s === '') throw new StatementParseError(`valor ilegível: "${original}"`, at);

  const thousands = decimalSeparator === ',' ? '.' : ',';
  s = s.split(thousands).join('');

  const parts = s.split(decimalSeparator);
  if (parts.length > 2) {
    throw new StatementParseError(`valor com mais de um decimal: "${original}"`, at);
  }

  const intPart = parts[0] ?? '';
  const fracRaw = parts[1] ?? '';
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracRaw)) {
    throw new StatementParseError(`valor ilegível: "${original}"`, at);
  }

  // Mais de duas casas decimais: depende do que há nelas.
  //
  //   `1.250`  → a terceira casa é ZERO. O valor cabe em centavos sem perda,
  //              e recusar seria falso positivo — muito exportador escreve
  //              três casas com zero à direita.
  //   `10,555` → a terceira casa TEM valor. Aceitar exigiria arredondar, e é
  //              assim que centavo some sem ninguém ver. Recusa.
  //
  // ⚠️ Limite conhecido: moedas de três decimais (KWD, BHD, TND) não cabem
  // neste modelo — o schema guarda centavos. Quando aparecer a primeira, é
  // decisão de produto, não arredondamento silencioso aqui.
  let frac = fracRaw;
  if (frac.length > 2) {
    const excedente = frac.slice(2);
    if (!/^0*$/.test(excedente)) {
      throw new StatementParseError(
        `valor com ${frac.length} casas decimais não cabe em centavos sem arredondar: "${original}"`,
        at,
      );
    }
    frac = frac.slice(0, 2);
  }
  frac = frac.padEnd(2, '0');
  const cents = Number(`${intPart || '0'}${frac}`);
  if (!Number.isSafeInteger(cents)) {
    throw new StatementParseError(`valor fora de faixa: "${original}"`, at);
  }
  return negative ? -cents : cents;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** Monta `YYYY-MM-DD` validando que a data existe de verdade. */
function buildDate(y: number, m: number, d: number, original: string, at?: { line?: number; field?: string }): IsoDate {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) {
    throw new StatementParseError(`data ilegível: "${original}"`, at);
  }
  if (y < 1900 || y > 2999 || m < 1 || m > 12 || d < 1 || d > 31) {
    throw new StatementParseError(`data fora de faixa: "${original}"`, at);
  }
  // 31/02 tem que doer aqui, não virar 03/03 silenciosamente.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    throw new StatementParseError(`data inexistente: "${original}"`, at);
  }
  return `${y}-${pad(m)}-${pad(d)}`;
}

/**
 * Data de CSV → `YYYY-MM-DD`.
 *
 * A ordem dos campos vem do mapeamento do tenant. `03/04/2026` é 3 de abril
 * ou 4 de março conforme o país que exportou o arquivo — e errar isso desloca
 * a conciliação inteira em um mês sem nenhum sintoma visível.
 */
export function parseDate(
  raw: string,
  order: DateOrder,
  at?: { line?: number; field?: string },
): IsoDate {
  const original = raw ?? '';
  const s = original.trim();
  if (s === '') throw new StatementParseError('data vazia', at);

  const nums = s.match(/\d+/g);
  if (!nums || nums.length < 3) {
    throw new StatementParseError(`data ilegível: "${original}"`, at);
  }
  const [a, b, c] = [Number(nums[0]), Number(nums[1]), Number(nums[2])];

  let y: number, m: number, d: number;
  if (order === 'YMD') {
    [y, m, d] = [a, b, c];
  } else if (order === 'DMY') {
    [d, m, y] = [a, b, c];
  } else {
    [m, d, y] = [a, b, c];
  }

  // Ano de dois dígitos: extrato antigo ainda existe. A janela é explícita.
  if (y < 100) y += y < 70 ? 2000 : 1900;

  return buildDate(y, m, d, original, at);
}

/**
 * Data do OFX (`YYYYMMDD` ou `YYYYMMDDHHMMSS[.xxx][TZ]`) → `YYYY-MM-DD`.
 *
 * Fica só com o dia. A hora do lançamento é do banco, não da conciliação:
 * usá-la faria a mesma transação cair em dias diferentes conforme o fuso do
 * servidor — e conciliação tem de dar o mesmo resultado em qualquer máquina.
 */
export function parseOfxDate(raw: string, at?: { line?: number; field?: string }): IsoDate {
  const s = (raw ?? '').trim();
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(s);
  if (!m) throw new StatementParseError(`data OFX ilegível: "${raw}"`, at);
  return buildDate(Number(m[1]), Number(m[2]), Number(m[3]), s, at);
}

/**
 * A impressão digital do arquivo — a chave que impede reimportar o mesmo
 * extrato duas vezes (`bank_statements_no_reimport`).
 *
 * SHA-256 pela Web Crypto, que existe no Node 20+ e no navegador. É API de
 * plataforma, não dependência: o pacote continua sem `node_modules` próprio.
 */
export async function contentHash(content: string): Promise<string> {
  const bytes = new TextEncoder().encode(content);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
