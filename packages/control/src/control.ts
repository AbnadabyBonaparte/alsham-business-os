/**
 * O motor puro do Módulo 76 — Controles Internos.
 *
 * ⭐ Duas físicas, de propósito, num módulo só:
 *
 *   • O CONTROLE é CADASTRO — `active ↔ archived`, a relação que volta (a física
 *     do `vendor`). O controle descontinuado volta a valer sem nascer de novo.
 *     `ALLOWED_TRANSITIONS` abaixo é o espelho de `control.allowed_transition()`
 *     no `0091_control.sql`, e um teste lê a migration e confere que os dois
 *     dizem a mesma coisa.
 *
 *   • O TESTE é LIVRO IMUTÁVEL — fato consumado (a física do `timesheet`). Este
 *     motor NÃO tem transição de teste, e a migration não tem status nem
 *     `allowed_transition` para `control.tests`: o teste nasce e nunca muda.
 *
 * ⭐ O tipo do controle é CHECK argumentado (`preventive`/`detective`/
 * `corrective` — física do COSO); o resultado do teste é CHECK (`pass`/`fail` —
 * o teste é binário). Fora das listas não é "outro valor"; é dado inválido.
 */
import type {
  ControlStatus,
  ControlSummary,
  ControlTest,
  ControlType,
  InternalControl,
  NewControlInput,
  NewTestInput,
  Problem,
  TestResult,
  Validation,
} from './types.ts';

/** active ↔ archived. O controle volta (a física do vendor). */
export const ALLOWED_TRANSITIONS: readonly (readonly [ControlStatus, ControlStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly ControlStatus[] = ['active', 'archived'];

/** Os tipos válidos de controle — física do COSO, CHECK no banco. */
export const CONTROL_TYPES: readonly ControlType[] = ['preventive', 'detective', 'corrective'];

/** Os resultados válidos de um teste — CHECK no banco. */
export const TEST_RESULTS: readonly TestResult[] = ['pass', 'fail'];

export function canTransition(from: ControlStatus, to: ControlStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: ControlStatus): readonly ControlStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

export function canArchive(status: ControlStatus): boolean {
  return canTransition(status, 'archived');
}

export function canRestore(status: ControlStatus): boolean {
  return canTransition(status, 'active');
}

/** Ativos primeiro, depois por nome — a leitura do cadastro vivo. */
export function orderControls(controls: readonly InternalControl[]): readonly InternalControl[] {
  const peso = (s: ControlStatus): number => (s === 'active' ? 0 : 1);
  return [...controls].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    return a.name.localeCompare(b.name);
  });
}

export function summarizeControls(controls: readonly InternalControl[]): ControlSummary {
  return {
    total: controls.length,
    active: controls.filter((c) => c.status === 'active').length,
    archived: controls.filter((c) => c.status === 'archived').length,
  };
}

const NAME_MAX = 200;
const DESCRIPTION_MAX = 1000;
const OWNER_MAX = 200;
const FREQUENCY_MAX = 120;
const NOTE_MAX = 1000;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Uma data ISO real (não só o formato: `2027-13-40` é recusada). Espelho do
 * `dataIso` do `timesheet`.
 */
function dataIso(valor: unknown): string | null {
  const t = texto(valor);
  if (t === null || !DATA_RE.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === t ? t : null;
}

/**
 * Valida um cadastro de controle novo. O nome e o tipo são obrigatórios (o tipo
 * tem de ser um dos três do COSO); o dono, a frequência, a descrição e o vínculo
 * ao risco são OPCIONAIS. Nasce ativo, com `id` vazio — a pura camada nunca
 * inventa dado do servidor.
 */
export function validateNewControl(input: NewControlInput): Validation<InternalControl> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome do controle.' });
  } else if (name.length > NAME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NAME_MAX} caracteres.` });
  }

  // Tipo: obrigatório, um dos três (física do COSO).
  const controlTypeBruto = texto(input.controlType);
  let controlType: ControlType | null = null;
  if (controlTypeBruto === null) {
    problems.push({ field: 'controlType', message: 'Informe o tipo do controle.' });
  } else if (!CONTROL_TYPES.includes(controlTypeBruto as ControlType)) {
    problems.push({
      field: 'controlType',
      message: 'O tipo deve ser preventive, detective ou corrective.',
    });
  } else {
    controlType = controlTypeBruto as ControlType;
  }

  // Descrição opcional (vira '').
  const descBruta = texto(input.description);
  let description = '';
  if (descBruta !== null) {
    if (descBruta.length > DESCRIPTION_MAX) {
      problems.push({ field: 'description', message: `Descrição com no máximo ${DESCRIPTION_MAX} caracteres.` });
    } else {
      description = descBruta;
    }
  }

  // Dono opcional (vira '').
  const ownerBruto = texto(input.owner);
  let owner = '';
  if (ownerBruto !== null) {
    if (ownerBruto.length > OWNER_MAX) {
      problems.push({ field: 'owner', message: `Dono com no máximo ${OWNER_MAX} caracteres.` });
    } else {
      owner = ownerBruto;
    }
  }

  // Frequência opcional (vira '').
  const freqBruta = texto(input.frequency);
  let frequency = '';
  if (freqBruta !== null) {
    if (freqBruta.length > FREQUENCY_MAX) {
      problems.push({ field: 'frequency', message: `Frequência com no máximo ${FREQUENCY_MAX} caracteres.` });
    } else {
      frequency = freqBruta;
    }
  }

  // Vínculo ao risco (id solto) — OPCIONAL. Ausente vira null.
  const eriskId = texto(input.eriskId);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      name: name!,
      description,
      controlType: controlType!,
      owner,
      frequency,
      eriskId,
      status: 'active',
    },
  };
}

/**
 * Valida um teste de controle novo. O controle (id solto), o dia e o resultado
 * são obrigatórios (o resultado tem de ser `pass` ou `fail`); a nota é OPCIONAL.
 * Nasce com `id` vazio: a pura camada nunca inventa dado do servidor. O teste é
 * fato consumado — corrigir é registrar outro, nunca reescrever.
 */
export function validateNewTest(input: NewTestInput): Validation<ControlTest> {
  const problems: Problem[] = [];

  // Controle: id solto obrigatório.
  const controlId = texto(input.controlId);
  if (controlId === null) {
    problems.push({ field: 'controlId', message: 'Informe o controle testado.' });
  }

  // Dia do teste: obrigatório, data ISO real.
  let testedOn: string | null = null;
  if (input.testedOn === undefined || input.testedOn === null || input.testedOn === '') {
    problems.push({ field: 'testedOn', message: 'Informe o dia em que o teste aconteceu.' });
  } else {
    const d = dataIso(input.testedOn);
    if (d === null) problems.push({ field: 'testedOn', message: 'A data deve estar no formato AAAA-MM-DD.' });
    else testedOn = d;
  }

  // Resultado: obrigatório, pass ou fail.
  const resultBruto = texto(input.result);
  let result: TestResult | null = null;
  if (resultBruto === null) {
    problems.push({ field: 'result', message: 'Informe o resultado do teste.' });
  } else if (!TEST_RESULTS.includes(resultBruto as TestResult)) {
    problems.push({ field: 'result', message: 'O resultado deve ser pass ou fail.' });
  } else {
    result = resultBruto as TestResult;
  }

  // Nota opcional (vira '').
  const notaBruta = texto(input.note);
  let note = '';
  if (notaBruta !== null) {
    if (notaBruta.length > NOTE_MAX) {
      problems.push({ field: 'note', message: `Nota com no máximo ${NOTE_MAX} caracteres.` });
    } else {
      note = notaBruta;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      controlId: controlId!,
      testedOn: testedOn!,
      result: result!,
      note,
    },
  };
}
