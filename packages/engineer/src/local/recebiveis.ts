/**
 * **O OBSERVADOR PROATIVO DE RECEBÍVEIS VENCIDOS — determinístico, sobre dado REAL.**
 *
 * Irmão do motor do Painel (`painel.ts`): uma função PURA que recebe os números
 * que o banco já tem e devolve o aviso em prosa. NUNCA inventa um número — o que
 * não vem no snapshot não aparece no texto (Lei 7). É a mesma doutrina grounded:
 * o texto determinístico é a fonte, e a Forja (voz de marca) só refinaria — nunca
 * inventaria um saldo.
 *
 * ⭐ **Por que é o CORAÇÃO da prova de cognição proativa:** o Engenheiro de hoje
 * responde quando perguntado. Este observador roda sozinho (agendado, via
 * `apps/api`), lê um fato que já existe (contas a receber vencidas) e AVISA sem
 * ser provocado — a lacuna que o MEMORANDO DA DIVISÃO DE ÁGUAS nomeia.
 *
 * ⛔ Módulo PURO: quem lê `ar.receivables` sob `service_role` é o `apps/api`, e
 * entrega os números aqui. Este arquivo não conhece banco, sessão nem credencial.
 */

/** O que o banco mede sobre os recebíveis vencidos de um tenant, numa moeda. */
export interface RecebiveisVencidosSnapshot {
  /** Quantos títulos em aberto já passaram do vencimento. */
  readonly overdueCount: number;
  /** A soma do que falta receber (`amount − received`), em centavos. */
  readonly outstandingCents: number;
  /** Há quantos dias venceu o mais antigo. */
  readonly oldestDays: number;
  /** ISO 4217 — a moeda deste recorte (somar moedas diferentes seria mentira). */
  readonly currency: string;
}

/** O aviso proativo que vira uma linha em `core.tenant_insights`. */
export interface InsightProativo {
  readonly kind: 'ar-overdue';
  /** O recorte dentro do tipo — aqui, a moeda. */
  readonly subjectKey: string;
  readonly headline: string;
  readonly detail: string;
  /** O NÚMERO verdadeiro por trás da frase — a contagem de vencidos. */
  readonly metricValue: number;
  readonly amountCents: number;
  readonly currency: string;
}

/** Dinheiro em prosa, determinístico e independente de locale: `BRL 1234.56`. */
function dinheiro(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

/**
 * Observa o snapshot e decide se há um aviso a dar.
 *
 * As três honestidades, na ordem:
 *  1. `null` (sem leitura — módulo não instalado, ou a consulta falhou) → `null`.
 *     A ausência de leitura NUNCA vira um zero fabricado.
 *  2. Zero vencidos → `null`. Não há urgência a inventar (a lição do
 *     `painelPrioridades`: sem pendência, não se anuncia pendência).
 *  3. Número infísico (negativo) → `null`. Um valor impossível não é insight.
 *
 * Só quando há de fato vencidos é que nasce a frase — e cada número dela vem do
 * snapshot, nenhum é derivado no ar.
 */
export function observarRecebiveisVencidos(
  s: RecebiveisVencidosSnapshot | null,
): InsightProativo | null {
  if (s === null) return null;
  if (!Number.isFinite(s.overdueCount) || s.overdueCount <= 0) return null;
  if (s.outstandingCents < 0 || s.oldestDays < 0) return null;

  const plural = s.overdueCount === 1 ? 'título vencido' : 'títulos vencidos';
  const dias = s.oldestDays === 1 ? 'dia' : 'dias';

  const headline = `${s.overdueCount} ${plural} — ${dinheiro(s.outstandingCents, s.currency)} a receber.`;
  const detail = `O mais antigo venceu há ${s.oldestDays} ${dias}. Vale priorizar a cobrança.`;

  return {
    kind: 'ar-overdue',
    subjectKey: s.currency,
    headline,
    detail,
    metricValue: s.overdueCount,
    amountCents: s.outstandingCents,
    currency: s.currency,
  };
}
