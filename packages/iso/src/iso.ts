/**
 * O motor puro do Módulo 66 — Requisitos ISO.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se uma cláusula pode ser arquivada ou
 * se um requisito pode ser reavaliado.
 *
 * ⭐⭐ **DOIS conceitos distintos, e é o cerne do módulo:**
 *
 * - A **conformidade** (`Compliance`) é uma AVALIAÇÃO **MUTÁVEL** — não um
 *   ciclo. Por isso NÃO existe função de transição de conformidade aqui: não há
 *   `canComplianceTransition`, não há tabela de pares. Qualquer valor vai para
 *   qualquer valor, quantas vezes a auditoria exigir. Ver o JSDoc de
 *   `NO_COMPLIANCE_TRANSITION` abaixo.
 * - O **arquivamento** (`ArchiveStatus`) é um ciclo REVERSÍVEL `active ↔
 *   archived` (a física do `vendor`/`dc`/`pfolio`). `ARCHIVE_TRANSITIONS` é o
 *   espelho de `iso.allowed_transition()` no `0081_iso.sql`, e um teste lê a
 *   migration e confere que os dois dizem a mesma coisa.
 *
 * @see supabase/migrations/0081_iso.sql
 * @see docs/canon/MODULO-ISO-SPEC.md
 */
import type {
  ArchiveStatus,
  AssessInput,
  Compliance,
  NewRequirementInput,
  Problem,
  Requirement,
  RequirementSummary,
  Validation,
} from './types.ts';

/**
 * ⭐ active ↔ archived, os dois sentidos. A cláusula volta ao escopo (a física
 * do `vendor`/`dc`/`pfolio`). Este é o ÚNICO ciclo de estados do módulo — a
 * conformidade NÃO tem um.
 */
export const ARCHIVE_TRANSITIONS: readonly (readonly [ArchiveStatus, ArchiveStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

/** Todos os estados de arquivamento — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly ArchiveStatus[] = ['active', 'archived'];

/** Todos os valores de conformidade — o CHECK do schema, espelhado no motor. */
export const ALL_COMPLIANCE: readonly Compliance[] = ['compliant', 'non_compliant', 'not_applicable'];

export function canArchiveTransition(from: ArchiveStatus, to: ArchiveStatus): boolean {
  if (from === to) return true;
  return ARCHIVE_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextArchiveStatuses(from: ArchiveStatus): readonly ArchiveStatus[] {
  return ARCHIVE_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Arquivar existe do ativo. */
export function canArchive(status: ArchiveStatus): boolean {
  return canArchiveTransition(status, 'archived');
}

/** Restaurar (reabrir) existe do arquivado — a cláusula volta ao escopo. */
export function canRestore(status: ArchiveStatus): boolean {
  return canArchiveTransition(status, 'active');
}

/**
 * ⭐⭐ **O CONTRASTE — o DIVERGE assinado.**
 *
 * `canReassess` diz se um requisito pode ser REAVALIADO. E note o que ele NÃO
 * é: NÃO é uma transição de conformidade. Só uma cláusula ATIVA se reavalia —
 * uma cláusula arquivada saiu de escopo e não tem conformidade a medir
 * (reabra primeiro). Fora essa única condição (estar no escopo), a
 * conformidade é **MUTÁVEL: qualquer valor vai para qualquer valor**, quantas
 * vezes a auditoria exigir.
 *
 * Por isso **NÃO existe** neste motor uma função de transição de conformidade
 * — nem `canComplianceTransition`, nem tabela de pares de conformidade. A
 * ausência é deliberada e é a assinatura do DIVERGE de TODOS os módulos com
 * ciclo de vida terminal (o `nc`: open→closed; o `audit`/`capa`: fins
 * terminais). Copiar sem pensar e divergir sem escrever são o mesmo erro
 * (CLAUDE.md): a pergunta "a conformidade tem ciclo de vida?" foi refeita, e a
 * resposta é NÃO — ela é uma avaliação que muda, e reavaliar é UPDATE honesto.
 */
export function canReassess(status: ArchiveStatus): boolean {
  return status === 'active';
}

const ORDEM: Record<ArchiveStatus, number> = {
  active: 0,
  archived: 1,
};

/** Ativos primeiro, depois arquivados; dentro, por referência de cláusula. */
export function orderRequirements(requirements: readonly Requirement[]): readonly Requirement[] {
  return [...requirements].sort((a, b) => {
    if (ORDEM[a.status] !== ORDEM[b.status]) return ORDEM[a.status] - ORDEM[b.status];
    return a.clauseReference.localeCompare(b.clauseReference);
  });
}

/** Conta por estado de arquivamento E por conformidade. Todo número é length. */
export function summarizeRequirements(requirements: readonly Requirement[]): RequirementSummary {
  return {
    total: requirements.length,
    active: requirements.filter((r) => r.status === 'active').length,
    archived: requirements.filter((r) => r.status === 'archived').length,
    compliant: requirements.filter((r) => r.compliance === 'compliant').length,
    nonCompliant: requirements.filter((r) => r.compliance === 'non_compliant').length,
    notApplicable: requirements.filter((r) => r.compliance === 'not_applicable').length,
  };
}

const CLAUSULA_MAX = 200;
const DESC_MAX = 4000;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

function isCompliance(valor: unknown): valor is Compliance {
  return typeof valor === 'string' && (ALL_COMPLIANCE as readonly string[]).includes(valor);
}

/**
 * Valida um requisito novo. A referência da cláusula e a descrição são
 * obrigatórias (texto livre). ⭐⭐ A conformidade é OBRIGATÓRIA e sem default
 * inventado (Lei 7): quem registra DECLARA a avaliação atual — o produto não
 * chuta "conforme" nem "não aplicável" por conta própria. Nasce ativo, com
 * `id` vazio — a pura camada nunca inventa dado do servidor.
 */
export function validateNewRequirement(input: NewRequirementInput): Validation<Requirement> {
  const problems: Problem[] = [];

  const clauseReference = texto(input.clauseReference);
  if (clauseReference === null) {
    problems.push({ field: 'clauseReference', message: 'Informe a referência da norma/cláusula.' });
  } else if (clauseReference.length > CLAUSULA_MAX) {
    problems.push({ field: 'clauseReference', message: `Referência com no máximo ${CLAUSULA_MAX} caracteres.` });
  }

  const description = texto(input.description);
  if (description === null) {
    problems.push({ field: 'description', message: 'Informe a descrição do requisito.' });
  } else if (description.length > DESC_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESC_MAX} caracteres.` });
  }

  // ⭐⭐ Conformidade REQUERIDA, sem default: nada de estado inventado (Lei 7).
  if (input.compliance === undefined || input.compliance === null) {
    problems.push({ field: 'compliance', message: 'Declare a conformidade atual (conforme, não conforme ou não aplicável).' });
  } else if (!isCompliance(input.compliance)) {
    problems.push({ field: 'compliance', message: 'Conformidade inválida.' });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      clauseReference: clauseReference!,
      description: description!,
      compliance: input.compliance as Compliance,
      status: 'active',
    },
  };
}

/**
 * Valida uma reavaliação. ⭐⭐ A conformidade é OBRIGATÓRIA e precisa ser um dos
 * valores válidos — não há default (Lei 7). Reavaliar é declarar a avaliação
 * nova; o motor não deduz "manteve" por omissão.
 */
export function validateAssessment(input: AssessInput): Validation<{ compliance: Compliance }> {
  const problems: Problem[] = [];

  if (input.compliance === undefined || input.compliance === null) {
    problems.push({ field: 'compliance', message: 'Declare a conformidade da reavaliação.' });
  } else if (!isCompliance(input.compliance)) {
    problems.push({ field: 'compliance', message: 'Conformidade inválida.' });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return { ok: true, value: { compliance: input.compliance as Compliance } };
}
