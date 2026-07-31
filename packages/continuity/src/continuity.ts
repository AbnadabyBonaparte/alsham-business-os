/**
 * O motor puro do Módulo 80 — Continuidade de Negócios.
 *
 * ⭐ O PLANO segue a física do `vendor` (relação que volta): `active ↔ archived`
 * — um plano descontinuado que a empresa retoma é o MESMO plano. O
 * `ALLOWED_TRANSITIONS` abaixo é o espelho de `continuity.allowed_transition()`
 * no `0095_continuity.sql`, e um teste lê a migration e confere que os dois
 * dizem a mesma coisa.
 *
 * ⭐⭐ O DRILL segue a física do LANÇAMENTO IMUTÁVEL (o `timesheet`, o `pcost`):
 * é fato consumado — nasce e nunca muda. Por isso o drill NÃO tem ciclo de
 * vida, NÃO tem transição, NÃO tem `Status`. A ausência é a lei.
 *
 * ⭐ O RECORTE: o DOCUMENTO detalhado do plano é o `pol` (declarado FORA). Os
 * DRILLS são o que justifica este módulo — a prova de que o plano funciona.
 */
import type {
  ContinuityDrill,
  ContinuityPlan,
  NewDrillInput,
  NewPlanInput,
  PlanStatus,
  PlanSummary,
  Problem,
  Validation,
} from './types.ts';

/** active ↔ archived. O plano volta (a física do vendor). */
export const ALLOWED_TRANSITIONS: readonly (readonly [PlanStatus, PlanStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly PlanStatus[] = ['active', 'archived'];

export function canTransition(from: PlanStatus, to: PlanStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: PlanStatus): readonly PlanStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

export function canArchive(status: PlanStatus): boolean {
  return canTransition(status, 'archived');
}

export function canRestore(status: PlanStatus): boolean {
  return canTransition(status, 'active');
}

/** Ativos primeiro, depois por nome — a leitura do cadastro vivo. */
export function orderPlans(plans: readonly ContinuityPlan[]): readonly ContinuityPlan[] {
  const peso = (s: PlanStatus): number => (s === 'active' ? 0 : 1);
  return [...plans].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    return a.name.localeCompare(b.name);
  });
}

export function summarizePlans(plans: readonly ContinuityPlan[]): PlanSummary {
  return {
    total: plans.length,
    active: plans.filter((p) => p.status === 'active').length,
    archived: plans.filter((p) => p.status === 'archived').length,
  };
}

/** Do dia mais recente ao mais antigo — a leitura do livro de drills. */
export function orderDrills(drills: readonly ContinuityDrill[]): readonly ContinuityDrill[] {
  return [...drills].sort((a, b) => {
    if (a.drilledOn !== b.drilledOn) return a.drilledOn < b.drilledOn ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

const NAME_MAX = 200;
const SCOPE_MAX = 1000;
const RTO_MAX = 200;
const RPO_MAX = 200;
const SCENARIO_MAX = 1000;
const OUTCOME_MAX = 1000;
const NOTE_MAX = 1000;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Uma data ISO real (não só o formato: `2027-02-30` é recusada). */
function dataIso(valor: unknown): string | null {
  const t = texto(valor);
  if (t === null || !DATA_RE.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === t ? t : null;
}

/**
 * Valida um plano novo. O nome é obrigatório; o escopo, o RTO e o RPO são
 * OPCIONAIS (texto livre — um plano sem alvo declarado ainda é honesto). Nasce
 * ativo, com `id` vazio: a pura camada nunca inventa dado do servidor.
 */
export function validateNewPlan(input: NewPlanInput): Validation<ContinuityPlan> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome do plano de continuidade.' });
  } else if (name.length > NAME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NAME_MAX} caracteres.` });
  }

  // Escopo é opcional: ausente vira '' (vazio), não um erro.
  const scopeBruto = texto(input.scope);
  let scope = '';
  if (scopeBruto !== null) {
    if (scopeBruto.length > SCOPE_MAX) {
      problems.push({ field: 'scope', message: `Escopo com no máximo ${SCOPE_MAX} caracteres.` });
    } else {
      scope = scopeBruto;
    }
  }

  // ⭐ RTO opcional, TEXTO LIVRE (nunca inteiro de minutos).
  const rtoBruto = texto(input.rto);
  let rto = '';
  if (rtoBruto !== null) {
    if (rtoBruto.length > RTO_MAX) {
      problems.push({ field: 'rto', message: `RTO com no máximo ${RTO_MAX} caracteres.` });
    } else {
      rto = rtoBruto;
    }
  }

  // ⭐ RPO opcional, TEXTO LIVRE.
  const rpoBruto = texto(input.rpo);
  let rpo = '';
  if (rpoBruto !== null) {
    if (rpoBruto.length > RPO_MAX) {
      problems.push({ field: 'rpo', message: `RPO com no máximo ${RPO_MAX} caracteres.` });
    } else {
      rpo = rpoBruto;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: { id: '', name: name!, scope, rto, rpo, status: 'active' },
  };
}

/**
 * Valida um drill novo. O plano (id solto), o dia, o cenário e o desfecho são
 * obrigatórios; a nota é OPCIONAL. Nasce com `id` vazio: a pura camada nunca
 * inventa dado do servidor. O drill é fato consumado — não há status a definir.
 */
export function validateNewDrill(input: NewDrillInput): Validation<ContinuityDrill> {
  const problems: Problem[] = [];

  const planId = texto(input.planId);
  if (planId === null) {
    problems.push({ field: 'planId', message: 'Informe o plano exercitado.' });
  }

  let drilledOn: string | null = null;
  if (input.drilledOn === undefined || input.drilledOn === null || input.drilledOn === '') {
    problems.push({ field: 'drilledOn', message: 'Informe o dia em que o drill aconteceu.' });
  } else {
    const d = dataIso(input.drilledOn);
    if (d === null) problems.push({ field: 'drilledOn', message: 'A data deve estar no formato AAAA-MM-DD.' });
    else drilledOn = d;
  }

  const scenario = texto(input.scenario);
  if (scenario === null) {
    problems.push({ field: 'scenario', message: 'Informe o cenário testado.' });
  } else if (scenario.length > SCENARIO_MAX) {
    problems.push({ field: 'scenario', message: `Cenário com no máximo ${SCENARIO_MAX} caracteres.` });
  }

  const outcome = texto(input.outcome);
  if (outcome === null) {
    problems.push({ field: 'outcome', message: 'Informe o desfecho do drill.' });
  } else if (outcome.length > OUTCOME_MAX) {
    problems.push({ field: 'outcome', message: `Desfecho com no máximo ${OUTCOME_MAX} caracteres.` });
  }

  // Nota opcional.
  const noteBruta = texto(input.note);
  let note = '';
  if (noteBruta !== null) {
    if (noteBruta.length > NOTE_MAX) {
      problems.push({ field: 'note', message: `Nota com no máximo ${NOTE_MAX} caracteres.` });
    } else {
      note = noteBruta;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      planId: planId!,
      drilledOn: drilledOn!,
      scenario: scenario!,
      outcome: outcome!,
      note,
    },
  };
}
