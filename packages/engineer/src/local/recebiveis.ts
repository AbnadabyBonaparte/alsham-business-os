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

/**
 * ⭐ **A MEMÓRIA ALÉM DA JANELA** — a média das leituras recentes deste mesmo
 * (tenant, tipo, recorte), lida do livro `core.tenant_insight_history` (0118).
 *
 * É o que separa o AVISADOR do ANALISTA: sem isto, o motor só diz "3 vencidos";
 * com isto, diz "3 vencidos — 40% acima da média recente". Os dois números
 * (a contagem de hoje e esta média) são REAIS — a comparação nunca é escondida.
 */
export interface TendenciaBaseline {
  /** Quantas leituras ANTERIORES entraram na média (0 = ainda sem histórico). */
  readonly sampleCount: number;
  /** A média da contagem de vencidos nessas leituras anteriores. */
  readonly avgMetric: number;
}

/**
 * ⚠️ Só se afirma tendência com pelo menos DUAS leituras anteriores — uma "média
 * recente" de uma amostra só seria a leitura anterior disfarçada de média.
 */
const MIN_AMOSTRAS_TENDENCIA = 2;

/** Abaixo deste %, hoje está "em linha" com a média — nem piora, nem melhora. */
const LIMIAR_ESTAVEL_PCT = 10;

/** Dinheiro em prosa, determinístico e independente de locale: `BRL 1234.56`. */
function dinheiro(cents: number, currency: string): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

/** A média em prosa: `2` para 2.0, `2.3` para 2.33 — honesta, sem casa à toa. */
function media(avg: number): string {
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
}

/**
 * A frase da TENDÊNCIA — ou `null` quando não há base honesta para afirmá-la
 * (sem baseline, poucas leituras, ou média não-positiva). Nunca inventa: expõe
 * a contagem de hoje E a média recente (com quantas leituras), lado a lado.
 */
function tendencia(overdueCount: number, baseline: TendenciaBaseline | null | undefined): string | null {
  if (!baseline) return null;
  if (!Number.isFinite(baseline.sampleCount) || baseline.sampleCount < MIN_AMOSTRAS_TENDENCIA) return null;
  if (!Number.isFinite(baseline.avgMetric) || baseline.avgMetric <= 0) return null;

  const pct = Math.round(((overdueCount - baseline.avgMetric) / baseline.avgMetric) * 100);
  const janela = `${media(baseline.avgMetric)} nas últimas ${baseline.sampleCount} leituras`;

  if (Math.abs(pct) < LIMIAR_ESTAVEL_PCT) {
    return `Em linha com a média recente (${janela}).`;
  }
  if (pct > 0) {
    return `${pct}% acima da média recente (${janela}) — a tendência é de piora.`;
  }
  return `${Math.abs(pct)}% abaixo da média recente (${janela}) — a tendência é de melhora.`;
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
  baseline?: TendenciaBaseline | null,
): InsightProativo | null {
  if (s === null) return null;
  if (!Number.isFinite(s.overdueCount) || s.overdueCount <= 0) return null;
  if (s.outstandingCents < 0 || s.oldestDays < 0) return null;

  const plural = s.overdueCount === 1 ? 'título vencido' : 'títulos vencidos';
  const dias = s.oldestDays === 1 ? 'dia' : 'dias';

  const headline = `${s.overdueCount} ${plural} — ${dinheiro(s.outstandingCents, s.currency)} a receber.`;

  // ⭐ O passo do ANALISTA: se há histórico honesto, a frase compara hoje com a
  // média recente. Sem histórico, é o AVISADOR de sempre — e isso é honesto.
  const frase = tendencia(s.overdueCount, baseline);
  const detail =
    `O mais antigo venceu há ${s.oldestDays} ${dias}.` +
    (frase ? ` ${frase}` : '') +
    ` Vale priorizar a cobrança.`;

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
