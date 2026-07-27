import type { RetryPolicy } from './types.ts';

/**
 * O backoff exponencial — o padrão de reentrega da Casa.
 *
 * Minerado do reentregador do `casa-bonaparte-saas` (Balanço §1: **PROVADO
 * ponta a ponta**, com rede de segurança sobre falha real em 24/07).
 *
 * Puro e determinístico: mesma entrada, mesma saída. É o que permite provar
 * a curva sem esperar meia hora num teste.
 */

/**
 * Espera antes da tentativa nº `attempts` (1 = a primeira reentrega).
 *
 * Dobra a cada tentativa, com **teto**. Sem teto, a sexta tentativa cairia
 * daqui a horas e o evento pareceria perdido; com teto, o correio insiste
 * num ritmo previsível.
 */
export function backoffDelayMs(attempts: number, policy: RetryPolicy): number {
  if (attempts <= 0) return 0;
  const expoente = Math.min(attempts - 1, 30); // trava antes de estourar o float
  const bruto = policy.baseDelayMs * 2 ** expoente;
  return Math.min(bruto, policy.maxDelayMs);
}

/** Quando tentar de novo, a partir de agora. */
export function nextAttemptAt(
  now: Date,
  attempts: number,
  policy: RetryPolicy,
): string {
  return new Date(now.getTime() + backoffDelayMs(attempts, policy)).toISOString();
}

/**
 * Já insistiu demais?
 *
 * `dead` **não apaga** o evento: ele fica na caixa, com o último erro, para
 * conferência humana. Perder evento em silêncio é a falha que a caixa de
 * saída existe para impedir — desistir e apagar seria recriá-la.
 */
export function isExhausted(attempts: number, policy: RetryPolicy): boolean {
  return attempts >= policy.maxAttempts;
}

/**
 * Política padrão de operação.
 *
 * ⚠️ É **default de operação**, não regra de negócio: 1s, dobrando até 1h,
 * desistindo na 8ª. Quem opera pode passar outra sem tocar em código.
 * Os números não vêm de medição — são ponto de partida, e estão marcados
 * como **NÃO VERIFICADOS** contra carga real (Lei 7).
 */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  baseDelayMs: 1_000,
  maxDelayMs: 3_600_000,
  maxAttempts: 8,
};
