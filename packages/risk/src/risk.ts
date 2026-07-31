/**
 * O motor puro do Módulo 60 — Riscos do projeto.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se um risco pode reabrir ou fechar.
 *
 * ⭐⭐ FÍSICA NOVA: `mitigated` REABRE (`mitigated → open`), `closed` é TERMINAL.
 * O `ALLOWED_TRANSITIONS` abaixo é o espelho de `risk.allowed_transition()` no
 * `0075_risk.sql`, e um teste lê a migration e confere que os dois dizem a mesma
 * coisa — e assina o contraste com o `proj` (cujos fins não reabrem).
 *
 * ⭐ A `severity` (probabilidade × impacto) é helper de LEITURA, nunca coluna de
 * decisão: ela só ordena a fila; nada no domínio DEPENDE dela.
 */
import type {
  NewRiskInput,
  Problem,
  Risk,
  RiskStatus,
  RiskSummary,
  Validation,
} from './types.ts';

/**
 * ⭐⭐ open→mitigated, open→closed, mitigated→closed, e o DIVERGE: mitigated→open
 * (reabrir — o mesmo risco). `closed` é TERMINAL.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [RiskStatus, RiskStatus])[] = [
  ['open', 'mitigated'],
  ['open', 'closed'],
  ['mitigated', 'closed'],
  ['mitigated', 'open'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly RiskStatus[] = ['open', 'mitigated', 'closed'];

export function canTransition(from: RiskStatus, to: RiskStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: RiskStatus): readonly RiskStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** ⭐⭐ Reabrir só existe para o mitigado — a física nova (o mesmo risco volta). */
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
 * ⭐ A severidade é probabilidade × impacto. Helper de LEITURA (ordena a fila);
 * nunca é coluna de decisão no banco — nada no domínio depende dela.
 */
export function severity(probability: number, impact: number): number {
  return probability * impact;
}

const ORDEM: Record<RiskStatus, number> = {
  open: 0,
  mitigated: 1,
  closed: 2,
};

/**
 * Abertos primeiro, depois mitigados, depois fechados; dentro de cada grupo, os
 * mais SEVEROS (probabilidade × impacto) primeiro; empate desfeito pela ordem de
 * criação (mais antigo primeiro).
 */
export function orderRisks(risks: readonly Risk[]): readonly Risk[] {
  return [...risks].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    const sev = severity(b.probability, b.impact) - severity(a.probability, a.impact);
    if (sev !== 0) return sev;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function summarizeRisks(risks: readonly Risk[]): RiskSummary {
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
 * Valida um risco novo (sempre nasce `open`).
 * projeto e descrição obrigatórios; probabilidade e impacto obrigatórios na
 * régua 1–5 (inteiro); plano de mitigação opcional. Nasce com `id` e `createdAt`
 * vazios.
 */
export function validateNewRisk(input: NewRiskInput): Validation<Risk> {
  const problems: Problem[] = [];

  const projectId = texto(input.projectId);
  if (projectId === null) {
    problems.push({ field: 'projectId', message: 'Informe o projeto do risco.' });
  }
  const projectName = texto(input.projectName) ?? '';

  const description = texto(input.description);
  if (description === null) {
    problems.push({ field: 'description', message: 'Descreva o risco.' });
  } else if (description.length > DESCRICAO_MAX) {
    problems.push({
      field: 'description',
      message: `Descrição com no máximo ${DESCRICAO_MAX} caracteres.`,
    });
  }

  const probability = reguaUmACinco(input.probability, 'probability', problems);
  const impact = reguaUmACinco(input.impact, 'impact', problems);

  let mitigationPlan = texto(input.mitigationPlan) ?? '';
  if (mitigationPlan.length > PLANO_MAX) {
    problems.push({
      field: 'mitigationPlan',
      message: `Plano de mitigação com no máximo ${PLANO_MAX} caracteres.`,
    });
    mitigationPlan = mitigationPlan.slice(0, PLANO_MAX);
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      projectId: projectId!,
      projectName,
      description: description!,
      probability: probability!,
      impact: impact!,
      mitigationPlan,
      status: 'open',
      createdAt: '',
    },
  };
}
