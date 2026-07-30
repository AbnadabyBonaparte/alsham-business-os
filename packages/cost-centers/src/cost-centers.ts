import type {
  AllocationRule,
  CenterStatus,
  ComputedShare,
  CostCenter,
  Problem,
  RuleLine,
  RuleStatus,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 28 — Centros de Custo & Rateio.
 *
 * A tela consome; NUNCA decide (Regra de Ouro).
 */

export const FULL_ALLOCATION_BP = 10000;

/**
 * ⭐ Espelho de `cc.allowed_center_transition()` no `0043_cc.sql` — há teste
 * que lê a migration e compara. IDA E VOLTA: o centro reorganizado é o MESMO
 * centro (o argumento do crm/cash).
 */
export const CENTER_TRANSITIONS: readonly (readonly [CenterStatus, CenterStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

/**
 * ⭐ Espelho de `cc.allowed_rule_transition()`. Arquivada é terminal — a
 * regra que muda é regra nova, para não reescrever a história das execuções.
 */
export const RULE_TRANSITIONS: readonly (readonly [RuleStatus, RuleStatus])[] = [
  ['draft', 'active'],
  ['active', 'archived'],
  ['draft', 'archived'],
];

export function canCenterTransition(from: CenterStatus, to: CenterStatus): boolean {
  return CENTER_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canRuleTransition(from: RuleStatus, to: RuleStatus): boolean {
  return RULE_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** Só o rascunho é plano: a regra ativa congela o desenho. */
export function canEditRule(status: RuleStatus): boolean {
  return status === 'draft';
}

export function sumBasisPoints(lines: readonly RuleLine[]): number {
  return lines.reduce((n, l) => n + l.basisPoints, 0);
}

/** ⭐ A física do 100%: a regra fecha exatamente 10000 pontos-base. */
export function isRuleComplete(rule: AllocationRule): boolean {
  return rule.lines.length > 0 && sumBasisPoints(rule.lines) === FULL_ALLOCATION_BP;
}

/** ⭐ Por que a regra não pode ativar — a recusa com nome (espelho do porteiro SQL). */
export function whyCannotActivate(rule: AllocationRule): string | null {
  if (!canRuleTransition(rule.status, 'active')) {
    return 'Só o rascunho ativa: a regra já corre ou já foi arquivada.';
  }
  if (rule.lines.length === 0) {
    return 'Regra sem centros não ateia: uma regra vazia não rateia nada.';
  }
  const soma = sumBasisPoints(rule.lines);
  if (soma !== FULL_ALLOCATION_BP) {
    const pct = (soma / 100).toFixed(2).replace('.', ',');
    return `A regra soma ${pct}% — o rateio fecha 100,00% ou perde custo no nada.`;
  }
  return null;
}

/**
 * ⭐ A MATEMÁTICA DO RATEIO — espelho do laço em `cc.execute_rateio()`.
 *
 * Distribui `totalCents` pelas linhas (ordenadas por basis desc, depois id);
 * o ÚLTIMO centro leva o RESTO da divisão. A soma das parcelas é EXATAMENTE
 * `totalCents` — cent nenhum se perde (a física do 100%).
 *
 * As linhas devem fechar 100% (regra ativa); a função é pura e não valida —
 * quem valida é `whyCannotActivate`. Com regra completa, o invariante vale.
 */
export function computeAllocations(
  totalCents: number,
  lines: readonly RuleLine[],
): readonly ComputedShare[] {
  if (lines.length === 0) return [];
  const ordenadas = [...lines].sort(
    (a, b) => b.basisPoints - a.basisPoints || a.centerId.localeCompare(b.centerId),
  );
  const out: ComputedShare[] = [];
  let acc = 0;
  ordenadas.forEach((line, i) => {
    let amount: number;
    if (i === ordenadas.length - 1) {
      amount = totalCents - acc;
    } else {
      amount = Math.trunc((totalCents * line.basisPoints) / FULL_ALLOCATION_BP);
      acc += amount;
    }
    out.push({ centerId: line.centerId, basisPoints: line.basisPoints, amountCents: amount });
  });
  return out;
}

export function orderCenters(centers: readonly CostCenter[]): readonly CostCenter[] {
  return [...centers].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

const NAME_MAX = 200;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

export function validateCenterName(name: unknown): Validation<{ name: string }> {
  const problems: Problem[] = [];
  const clean = texto(name);
  if (clean === null) {
    problems.push({ field: 'name', message: 'Dê um nome ao centro de custo.' });
  } else if (clean.length > NAME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NAME_MAX} caracteres.` });
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true, value: { name: clean! } };
}

/** Valida um pedido de execução — total positivo, moeda ISO, origem com tipo. */
export function validateExecution(input: {
  totalCents?: unknown;
  currency?: unknown;
  sourceKind?: unknown;
  competenceOn?: unknown;
}): Validation<{ totalCents: number; currency: string; sourceKind: string; competenceOn: string }> {
  const problems: Problem[] = [];

  const total = input.totalCents;
  if (typeof total !== 'number' || !Number.isInteger(total) || total <= 0) {
    problems.push({ field: 'totalCents', message: 'O total a ratear é um valor positivo.' });
  }
  const currency = texto(input.currency);
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'A moeda é um código ISO de 3 letras.' });
  }
  const sourceKind = texto(input.sourceKind);
  if (sourceKind === null) {
    problems.push({ field: 'sourceKind', message: 'De onde vem o valor? A origem precisa de um tipo.' });
  }
  const competenceOn = texto(input.competenceOn);
  if (competenceOn === null || !/^\d{4}-\d{2}-\d{2}$/.test(competenceOn)) {
    problems.push({ field: 'competenceOn', message: 'A competência é uma data.' });
  }

  return problems.length > 0
    ? { ok: false, problems }
    : {
        ok: true,
        value: {
          totalCents: total as number,
          currency: currency!,
          sourceKind: sourceKind!,
          competenceOn: competenceOn!,
        },
      };
}
