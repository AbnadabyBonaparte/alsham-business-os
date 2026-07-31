/**
 * O motor puro do Módulo 56 — Recursos / Alocação.
 *
 * ⭐ A física é a do `vendor`/`dc` (relação/linha que volta), re-perguntada: uma
 * alocação NÃO é gente contratada (o `hr`, onde `terminated` é terminal) — é uma
 * LINHA DE PLANEJAMENTO. A alocação de um recurso a um projeto que a empresa
 * arquivou e depois retoma é a MESMA linha. Então `archived → active` EXISTE. O
 * `ALLOWED_TRANSITIONS` abaixo é o espelho de `alloc.allowed_transition()` no
 * `0071_alloc.sql`, e um teste lê a migration e confere que os dois dizem o mesmo.
 *
 * ⭐ A régua é PERCENTUAL (0 < pct <= 100), não horas — horas exigiriam o
 * calendário do projeto (um TIMESHEET), que este módulo não modela.
 */
import type {
  Allocation,
  AllocationStatus,
  AllocationSummary,
  NewAllocationInput,
  Problem,
  Validation,
} from './types.ts';

/** active ↔ archived. A alocação volta (a física do vendor/dc; o DIVERGE do hr). */
export const ALLOWED_TRANSITIONS: readonly (readonly [AllocationStatus, AllocationStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly AllocationStatus[] = ['active', 'archived'];

export function canTransition(from: AllocationStatus, to: AllocationStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: AllocationStatus): readonly AllocationStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

export function canArchive(status: AllocationStatus): boolean {
  return canTransition(status, 'archived');
}

export function canReopen(status: AllocationStatus): boolean {
  return canTransition(status, 'active');
}

/** Ativas primeiro, depois por projeto e recurso — a leitura do plano vivo. */
export function orderAllocations(allocations: readonly Allocation[]): readonly Allocation[] {
  const peso = (s: AllocationStatus): number => (s === 'active' ? 0 : 1);
  return [...allocations].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    const porProjeto = a.projectName.localeCompare(b.projectName);
    if (porProjeto !== 0) return porProjeto;
    return a.resourceName.localeCompare(b.resourceName);
  });
}

export function summarizeAllocations(allocations: readonly Allocation[]): AllocationSummary {
  return {
    total: allocations.length,
    active: allocations.filter((a) => a.status === 'active').length,
    archived: allocations.filter((a) => a.status === 'archived').length,
  };
}

const RESOURCE_MAX = 200;
const PROJECT_NAME_MAX = 200;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Normaliza uma data ISO opcional: aceita string não vazia; senão `null`. */
function data(valor: unknown): string | null {
  return texto(valor);
}

/**
 * Valida uma alocação nova. O projeto (id) e o recurso são obrigatórios; o
 * percentual é obrigatório e deve estar em (0, 100]; o colaborador e as datas
 * são opcionais (se ambas presentes, o fim não vem antes do início). Nasce
 * ativa, com `id` vazio — a pura camada nunca inventa dado do servidor.
 */
export function validateNewAllocation(input: NewAllocationInput): Validation<Allocation> {
  const problems: Problem[] = [];

  const projectId = texto(input.projectId);
  if (projectId === null) {
    problems.push({ field: 'projectId', message: 'Informe o projeto da alocação.' });
  }

  // O nome do projeto é carimbado pela tela; opcional aqui (vira '' se ausente).
  const projectNameBruto = texto(input.projectName);
  let projectName = '';
  if (projectNameBruto !== null) {
    if (projectNameBruto.length > PROJECT_NAME_MAX) {
      problems.push({
        field: 'projectName',
        message: `Nome do projeto com no máximo ${PROJECT_NAME_MAX} caracteres.`,
      });
    } else {
      projectName = projectNameBruto;
    }
  }

  const resourceName = texto(input.resourceName);
  if (resourceName === null) {
    problems.push({ field: 'resourceName', message: 'Informe o nome do recurso.' });
  } else if (resourceName.length > RESOURCE_MAX) {
    problems.push({
      field: 'resourceName',
      message: `Nome do recurso com no máximo ${RESOURCE_MAX} caracteres.`,
    });
  }

  // O colaborador é OPCIONAL (o recurso pode ser um terceiro sem cadastro).
  const employeeId = texto(input.employeeId);

  // ⭐ O percentual é obrigatório e deve estar em (0, 100].
  let allocationPct = 0;
  if (input.allocationPct === undefined || input.allocationPct === null || input.allocationPct === '') {
    problems.push({ field: 'allocationPct', message: 'Informe o percentual de alocação.' });
  } else {
    const n = typeof input.allocationPct === 'number' ? input.allocationPct : Number(input.allocationPct);
    if (!Number.isFinite(n)) {
      problems.push({ field: 'allocationPct', message: 'O percentual precisa ser um número.' });
    } else if (n <= 0 || n > 100) {
      problems.push({
        field: 'allocationPct',
        message: 'O percentual precisa ser maior que 0 e no máximo 100.',
      });
    } else {
      allocationPct = n;
    }
  }

  const startsOn = data(input.startsOn);
  const endsOn = data(input.endsOn);
  if (startsOn !== null && endsOn !== null && endsOn < startsOn) {
    problems.push({ field: 'endsOn', message: 'O fim não pode vir antes do início.' });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      projectId: projectId!,
      projectName,
      resourceName: resourceName!,
      employeeId,
      allocationPct,
      startsOn,
      endsOn,
      status: 'active',
    },
  };
}
