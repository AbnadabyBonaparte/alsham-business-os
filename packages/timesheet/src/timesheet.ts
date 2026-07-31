/**
 * O motor puro do Módulo 61 — Apontamento de horas (Timesheet).
 *
 * ⭐⭐ A física é a do LANÇAMENTO IMUTÁVEL (o `pcost`, o `recv`, o `occ`): o
 * apontamento é fato consumado — nasce e nunca muda. Por isso este motor NÃO
 * TEM transições de ciclo de vida, NÃO TEM `ALLOWED_TRANSITIONS`, NÃO TEM
 * `canTransition`. A ausência é a lei: um teste lê o `0076_timesheet.sql` e
 * confere que a migration também não declara `allowed_transition` e não tem
 * coluna de status.
 *
 * ⭐ O contraste com o `alloc` (Módulo 56): o `alloc` é o PLANEJADO — o
 * percentual de capacidade previsto, mutável (active ↔ archived). O `timesheet`
 * é o REALIZADO — a hora efetivamente trabalhada, imutável. `summarizeEntries`
 * soma o livro por colaborador — é um TOTAL de horas trabalhadas, nunca um
 * saldo de capacidade a alocar.
 */
import type {
  CollaboratorHours,
  NewTimesheetEntryInput,
  Problem,
  TimesheetEntry,
  TimesheetSummary,
  Validation,
} from './types.ts';

/** Do dia mais recente ao mais antigo — a leitura do livro. Tiebreak por id. */
export function orderEntries(entries: readonly TimesheetEntry[]): readonly TimesheetEntry[] {
  return [...entries].sort((a, b) => {
    if (a.workedOn !== b.workedOn) return a.workedOn < b.workedOn ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

/** A soma pura das horas do livro. Nunca chute — sempre soma. */
export function totalHours(entries: readonly TimesheetEntry[]): number {
  return entries.reduce((soma, e) => soma + e.hours, 0);
}

/**
 * Agrupa por colaborador e soma as horas de cada um. Cada colaborador vira uma
 * linha com o total (soma das horas) e a contagem. Os nomes saem em ordem
 * estável.
 */
export function groupByCollaborator(
  entries: readonly TimesheetEntry[],
): readonly CollaboratorHours[] {
  const mapa = new Map<string, { totalHours: number; count: number }>();
  for (const e of entries) {
    const atual = mapa.get(e.collaboratorName) ?? { totalHours: 0, count: 0 };
    atual.totalHours += e.hours;
    atual.count += 1;
    mapa.set(e.collaboratorName, atual);
  }
  return [...mapa.entries()]
    .map(([collaboratorName, v]) => ({
      collaboratorName,
      totalHours: v.totalHours,
      count: v.count,
    }))
    .sort((a, b) => a.collaboratorName.localeCompare(b.collaboratorName));
}

/** Um resumo contável do livro — total de linhas, total de horas, por pessoa. */
export function summarizeEntries(entries: readonly TimesheetEntry[]): TimesheetSummary {
  return {
    total: entries.length,
    totalHours: totalHours(entries),
    byCollaborator: groupByCollaborator(entries),
  };
}

const PROJECT_NAME_MAX = 200;
const COLLABORATOR_NAME_MAX = 200;
const DESCRIPTION_MAX = 1000;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Normaliza texto: trim, e vazio vira `null` (nada de string em branco). */
function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Uma data ISO real (não só o formato: `2027-13-40` é recusada). Espelho do
 * `dataIso` do `scrum`.
 */
function dataIso(valor: unknown): string | null {
  const t = texto(valor);
  if (t === null || !DATA_RE.test(t)) return null;
  const d = new Date(`${t}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Confere que o round-trip bate (recusa 2027-02-30 etc.).
  return d.toISOString().slice(0, 10) === t ? t : null;
}

/**
 * Valida um apontamento novo. O projeto (id solto), o colaborador (nome), o dia
 * e as horas são obrigatórios; as horas têm de ser um número finito e
 * ESTRITAMENTE positivo (não se aponta zero nem trabalho negativo — o CHECK do
 * banco confere `hours > 0`); o colaborador cadastrado e a descrição são
 * OPCIONAIS. Nasce com `id` vazio: a pura camada nunca inventa dado do servidor.
 */
export function validateNewEntry(input: NewTimesheetEntryInput): Validation<TimesheetEntry> {
  const problems: Problem[] = [];

  // Projeto: id solto obrigatório.
  const projectId = texto(input.projectId);
  if (projectId === null) {
    problems.push({ field: 'projectId', message: 'Informe o projeto do apontamento.' });
  }

  // Nome do projeto carimbado pela tela — opcional (vira '').
  const nomeBruto = texto(input.projectName);
  let projectName = '';
  if (nomeBruto !== null) {
    if (nomeBruto.length > PROJECT_NAME_MAX) {
      problems.push({ field: 'projectName', message: `Nome com no máximo ${PROJECT_NAME_MAX} caracteres.` });
    } else {
      projectName = nomeBruto;
    }
  }

  // Colaborador: nome em texto livre, obrigatório (pode ser terceiro).
  const collaboratorName = texto(input.collaboratorName);
  if (collaboratorName === null) {
    problems.push({ field: 'collaboratorName', message: 'Informe quem trabalhou.' });
  } else if (collaboratorName.length > COLLABORATOR_NAME_MAX) {
    problems.push({ field: 'collaboratorName', message: `Nome com no máximo ${COLLABORATOR_NAME_MAX} caracteres.` });
  }

  // Colaborador cadastrado (id solto) — OPCIONAL.
  const collaboratorId = texto(input.collaboratorId);

  // Dia trabalhado: obrigatório, data ISO real.
  let workedOn: string | null = null;
  if (input.workedOn === undefined || input.workedOn === null || input.workedOn === '') {
    problems.push({ field: 'workedOn', message: 'Informe o dia em que o trabalho aconteceu.' });
  } else {
    const d = dataIso(input.workedOn);
    if (d === null) problems.push({ field: 'workedOn', message: 'A data deve estar no formato AAAA-MM-DD.' });
    else workedOn = d;
  }

  // Horas: número finito, ESTRITAMENTE positivo. Zero é linha muda; negativo
  // não é trabalho. Corrigir é lançar o ato inverso, nunca reescrever.
  const horas = input.hours;
  if (typeof horas !== 'number' || !Number.isFinite(horas)) {
    problems.push({ field: 'hours', message: 'Informe as horas trabalhadas (número).' });
  } else if (horas <= 0) {
    problems.push({ field: 'hours', message: 'As horas devem ser maiores que zero.' });
  }

  // Descrição opcional.
  const descBruta = texto(input.description);
  let description = '';
  if (descBruta !== null) {
    if (descBruta.length > DESCRIPTION_MAX) {
      problems.push({ field: 'description', message: `Descrição com no máximo ${DESCRIPTION_MAX} caracteres.` });
    } else {
      description = descBruta;
    }
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
      collaboratorName: collaboratorName!,
      collaboratorId,
      workedOn: workedOn!,
      hours: horas as number,
      description,
    },
  };
}
