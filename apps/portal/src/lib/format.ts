/**
 * Formatação — **apresentação pura**.
 *
 * Nada aqui decide nada. Transformar centavos em `R$ 1.250,00` é ofício de
 * tela; se algum dia isto começar a arredondar, comparar ou classificar, é
 * porque virou regra de negócio e tem de mudar de casa (CLAUDE.md §5.3).
 */

/**
 * Centavos → texto de moeda.
 *
 * Recebe **inteiro em centavos** e divide só na hora de exibir: o valor nunca
 * vira float antes disso.
 */
export function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency,
  }).format(cents / 100);
}

/** `2026-07-10` → `10/07/2026`. Sem fuso: data-calendário é dia, não instante. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

/** Timestamp → `26/07 09:40`, em UTC, para não variar com o servidor. */
export function stamp(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(dt.getUTCDate())}/${p(dt.getUTCMonth() + 1)} ${p(dt.getUTCHours())}:${p(dt.getUTCMinutes())}`;
}

/** `0.7857` → `79%`. A confiança é lida como percentual, não como fração. */
export function confidence(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * Quantos dias um item está parado, a partir de um "agora" **recebido**.
 *
 * O `agora` é parâmetro de propósito: componente que lê o relógio sozinho
 * renderiza diferente no servidor e no cliente, e o React reclama de
 * hidratação. Quem sabe que horas são é a página, uma vez só.
 */
export function ageInDays(iso: string, nowMs: number): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((nowMs - then) / 86_400_000));
}
