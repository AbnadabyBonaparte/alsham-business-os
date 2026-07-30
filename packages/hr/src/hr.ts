import type {
  Employee,
  EmployeeStatus,
  NewEmployeeInput,
  Problem,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 33 — Cadastro de Colaboradores.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a
 * RLS e os gatilhos do `0048_hr.sql`; o pacote avisa antes, com a MESMA
 * régua, para a recusa chegar com nome em vez de erro de constraint.
 */

/**
 * ⭐ Espelho de `hr.allowed_transition()` no `0048_hr.sql` — há teste que lê
 * a migration e compara. `on_leave ↔ active` (o afastamento volta);
 * `terminated` é TERMINAL — quem retorna assina contrato novo.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [EmployeeStatus, EmployeeStatus])[] = [
  ['active', 'on_leave'],
  ['on_leave', 'active'],
  ['active', 'terminated'],
  ['on_leave', 'terminated'],
];

export function canTransition(from: EmployeeStatus, to: EmployeeStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/** Só `terminated` não volta. O contraste dos dois "parar". */
export function isTerminal(status: EmployeeStatus): boolean {
  return status === 'terminated';
}

export function canTerminate(status: EmployeeStatus): boolean {
  return canTransition(status, 'terminated');
}

export function canEditEmployee(status: EmployeeStatus): boolean {
  return status !== 'terminated';
}

/** A recusa do desligamento, com nome — a mesma física do gatilho. */
export function whyCannotTerminate(employee: Employee, reason: string): string | null {
  if (!canTerminate(employee.status)) {
    return 'Colaborador já desligado — quem retorna é admissão nova.';
  }
  if (reason.trim().length === 0) {
    return 'Desligar exige a razão escrita: nunca desligar em silêncio.';
  }
  return null;
}

/** O roster na ordem de leitura: ativos e afastados primeiro, desligados por último. */
export function orderRoster(employees: readonly Employee[]): readonly Employee[] {
  const peso = (s: EmployeeStatus): number => (s === 'terminated' ? 1 : 0);
  return [...employees].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    return a.fullName.localeCompare(b.fullName);
  });
}

export interface HrSummary {
  readonly total: number;
  readonly active: number;
  readonly onLeave: number;
  readonly terminated: number;
}

export function summarizeRoster(employees: readonly Employee[]): HrSummary {
  let active = 0;
  let onLeave = 0;
  let terminated = 0;
  for (const e of employees) {
    if (e.status === 'active') active += 1;
    else if (e.status === 'on_leave') onLeave += 1;
    else terminated += 1;
  }
  return { total: employees.length, active, onLeave, terminated };
}

const NOME_MAX = 200;
const CARGO_MAX = 200;
const DEPTO_MAX = 200;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um colaborador novo. Nome e cargo são obrigatórios; departamento é
 * opcional. Nenhum dado sensível é aceito porque nenhum campo sensível existe.
 */
export function validateNewEmployee(input: NewEmployeeInput): Validation<Employee> {
  const problems: Problem[] = [];

  const fullName = texto(input.fullName);
  if (fullName === null) {
    problems.push({ field: 'fullName', message: 'Informe o nome do colaborador.' });
  } else if (fullName.length > NOME_MAX) {
    problems.push({ field: 'fullName', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  const roleTitle = texto(input.roleTitle);
  if (roleTitle === null) {
    problems.push({ field: 'roleTitle', message: 'Informe o cargo.' });
  } else if (roleTitle.length > CARGO_MAX) {
    problems.push({ field: 'roleTitle', message: `Cargo com no máximo ${CARGO_MAX} caracteres.` });
  }

  const hiredOn = texto(input.hiredOn);
  if (hiredOn === null || !DATE_RE.test(hiredOn)) {
    problems.push({ field: 'hiredOn', message: 'Informe a data de admissão.' });
  }

  let department = texto(input.department) ?? '';
  if (department.length > DEPTO_MAX) {
    problems.push({ field: 'department', message: `Departamento com no máximo ${DEPTO_MAX} caracteres.` });
    department = department.slice(0, DEPTO_MAX);
  }

  const previousEmployeeId = texto(input.previousEmployeeId);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      fullName: fullName!,
      roleTitle: roleTitle!,
      department,
      hiredOn: hiredOn!,
      status: 'active',
      terminationReason: '',
      previousEmployeeId,
    },
  };
}
