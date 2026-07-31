/**
 * O motor puro do Módulo 75 — Risco Corporativo.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se um risco pode reabrir ou fechar.
 *
 * ⭐⭐ FÍSICA MANTIDA do `risk` (Módulo 60): `mitigated` REABRE (`mitigated →
 * open`), `closed` é TERMINAL. O `ALLOWED_TRANSITIONS` abaixo é o espelho de
 * `erisk.allowed_transition()` no `0090_erisk.sql`, e um teste lê a migration e
 * confere que os dois dizem a mesma coisa — e ASSINA o contraste com o `risk`
 * (mesma física do ciclo) e o DIVERGE (o `erisk` não tem projeto; tem
 * `treatment`).
 *
 * ⭐ A `severity` (probabilidade × impacto) é helper de LEITURA — a matriz de
 * riscos — nunca coluna de decisão: ela só ordena a fila; nada no domínio
 * DEPENDE dela.
 */
import type {
  EnterpriseRisk,
  NewRiskInput,
  Problem,
  RiskStatus,
  RiskSummary,
  Treatment,
  Validation,
} from './types.ts';

/**
 * ⭐⭐ open→mitigated, open→closed, mitigated→closed, e a reabertura:
 * mitigated→open (o mesmo risco volta). `closed` é TERMINAL. Espelho EXATO de
 * `erisk.allowed_transition` no `0090_erisk.sql`.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [RiskStatus, RiskStatus])[] = [
  ['open', 'mitigated'],
  ['open', 'closed'],
  ['mitigated', 'closed'],
  ['mitigated', 'open'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly RiskStatus[] = ['open', 'mitigated', 'closed'];

/** Os 4 T's da ISO 31000 — a física do MÉTODO (espelho do CHECK no banco). */
export const TREATMENTS: readonly Treatment[] = ['accept', 'mitigate', 'transfer', 'avoid'];

export function canTransition(from: RiskStatus, to: RiskStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: RiskStatus): readonly RiskStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** ⭐⭐ Reabrir só existe para o mitigado — a física MANTIDA (o mesmo risco volta). */
export function canReopen(status: RiskStatus): boolean {
  return status === 'mitigated';
}

/** Fechar existe do aberto e do mitigado. */
export function canClose(status: RiskStatus): boolean {
  return status === 'open' || status === 'mitigated';
}

/** Mitigar (open→mitigated) só existe para o aberto. */
export function canMitigate(status: RiskStatus): boolean {
  return status === 'open';
}

/** O conteúdo só muda antes do encerramento — `closed` congela (é história). */
export function canEditContent(status: RiskStatus): boolean {
  return status !== 'closed';
}

/**
 * ⭐ A severidade é probabilidade × impacto — a MATRIZ DE RISCOS. Helper de
 * LEITURA (ordena a fila); nunca é coluna de decisão no banco — nada no domínio
 * depende dela.
 */
export function severity(risk: Pick<EnterpriseRisk, 'probability' | 'impact'>): number {
  return risk.probability * risk.impact;
}

const ORDEM: Record<RiskStatus, number> = {
  open: 0,
  mitigated: 1,
  closed: 2,
};

/**
 * Abertos primeiro, depois mitigados, depois fechados; dentro de cada grupo, os
 * mais SEVEROS (probabilidade × impacto) primeiro. É a leitura da matriz.
 */
export function orderBySeverity(risks: readonly EnterpriseRisk[]): readonly EnterpriseRisk[] {
  return [...risks].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    return severity(b) - severity(a);
  });
}

export function summarizeRisks(risks: readonly EnterpriseRisk[]): RiskSummary {
  return {
    total: risks.length,
    open: risks.filter((r) => r.status === 'open').length,
    mitigated: risks.filter((r) => r.status === 'mitigated').length,
    closed: risks.filter((r) => r.status === 'closed').length,
  };
}

const DESCRICAO_MAX = 2000;
const PLANO_MAX = 4000;
const REGUA_MIN = 1;
const REGUA_MAX = 5;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * A régua 1–5: aceita só inteiro dentro do intervalo. `2.5`, `0`, `6` e `"3"`
 * são recusados — a física do método não admite meio-ponto nem fora da escala.
 */
function reguaUmACinco(valor: unknown, campo: string, problems: Problem[]): number | null {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) {
    problems.push({ field: campo, message: `Informe um inteiro de ${REGUA_MIN} a ${REGUA_MAX}.` });
    return null;
  }
  if (valor < REGUA_MIN || valor > REGUA_MAX) {
    problems.push({ field: campo, message: `Valor entre ${REGUA_MIN} e ${REGUA_MAX}.` });
    return null;
  }
  return valor;
}

/**
 * A estratégia de tratamento (os 4 T's). OPCIONAL: ausente/vazio vira `null`. Se
 * presente, tem de ser um dos quatro — o resto é recusado.
 */
function tratamento(valor: unknown, problems: Problem[]): Treatment | null {
  const t = texto(valor);
  if (t === null) return null;
  if (!TREATMENTS.includes(t as Treatment)) {
    problems.push({ field: 'treatment', message: 'Tratamento inválido (accept/mitigate/transfer/avoid).' });
    return null;
  }
  return t as Treatment;
}

/**
 * Valida um risco corporativo novo (sempre nasce `open`).
 * descrição obrigatória; probabilidade e impacto obrigatórios na régua 1–5
 * (inteiro); categoria, dono, plano e controle OPCIONAIS; tratamento opcional,
 * mas se presente tem de ser um dos 4 T's. Nasce com `id` vazio.
 */
export function validateNewRisk(input: NewRiskInput): Validation<EnterpriseRisk> {
  const problems: Problem[] = [];

  const description = texto(input.description);
  if (description === null) {
    problems.push({ field: 'description', message: 'Descreva o risco.' });
  } else if (description.length > DESCRICAO_MAX) {
    problems.push({
      field: 'description',
      message: `Descrição com no máximo ${DESCRICAO_MAX} caracteres.`,
    });
  }

  const category = texto(input.category) ?? '';
  const owner = texto(input.owner) ?? '';
  const ownerId = texto(input.ownerId);
  const controlId = texto(input.controlId);

  const probability = reguaUmACinco(input.probability, 'probability', problems);
  const impact = reguaUmACinco(input.impact, 'impact', problems);

  const treatment = tratamento(input.treatment, problems);

  let treatmentPlan = texto(input.treatmentPlan) ?? '';
  if (treatmentPlan.length > PLANO_MAX) {
    problems.push({
      field: 'treatmentPlan',
      message: `Plano de tratamento com no máximo ${PLANO_MAX} caracteres.`,
    });
    treatmentPlan = treatmentPlan.slice(0, PLANO_MAX);
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      description: description!,
      category,
      owner,
      ownerId,
      probability: probability!,
      impact: impact!,
      treatment,
      treatmentPlan,
      controlId,
      status: 'open',
    },
  };
}
