import type {
  Enrollment,
  EnrollmentStatus,
  NewEnrollmentInput,
  NewProgramInput,
  NewSessionInput,
  Problem,
  Program,
  Session,
  SessionStatus,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 35 — Treinamentos.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a
 * RLS e os gatilhos do `0050_train.sql`; o pacote avisa antes, com a MESMA
 * régua, para a recusa chegar com nome em vez de erro de constraint.
 */

// -----------------------------------------------------------------------------
// A TURMA — espelho de train.allowed_session_transition() no 0050_train.sql
// -----------------------------------------------------------------------------

/**
 * ⭐ Espelho de `train.allowed_session_transition()` — há teste que lê a
 * migration e compara. A mesma física do evt: publicar abre inscrição;
 * `concluded` e `cancelled` são TERMINAIS.
 */
export const SESSION_TRANSITIONS: readonly (readonly [SessionStatus, SessionStatus])[] = [
  ['draft', 'published'],
  ['draft', 'cancelled'],
  ['published', 'concluded'],
  ['published', 'cancelled'],
];

export function canTransitionSession(from: SessionStatus, to: SessionStatus): boolean {
  return SESSION_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function isSessionTerminal(status: SessionStatus): boolean {
  return status === 'concluded' || status === 'cancelled';
}

// -----------------------------------------------------------------------------
// A INSCRIÇÃO — espelho de train.allowed_enrollment_transition() no 0050_train.sql
// -----------------------------------------------------------------------------

/**
 * ⭐ Espelho de `train.allowed_enrollment_transition()`. `completed` e
 * `cancelled` são TERMINAIS. `attended → completed` é o DIVERGE assinado do
 * evt: a conclusão do treinamento é um fato que a presença sozinha não tem.
 */
export const ENROLLMENT_TRANSITIONS: readonly (readonly [EnrollmentStatus, EnrollmentStatus])[] = [
  ['registered', 'attended'],
  ['registered', 'cancelled'],
  ['attended', 'completed'],
  ['attended', 'cancelled'],
];

export function canTransitionEnrollment(from: EnrollmentStatus, to: EnrollmentStatus): boolean {
  return ENROLLMENT_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function isEnrollmentTerminal(status: EnrollmentStatus): boolean {
  return status === 'completed' || status === 'cancelled';
}

/**
 * A recusa da inscrição, com nome — a mesma física do gatilho
 * `train.guard_enrollment_insert()`: só turma PUBLICADA recebe inscrição, e
 * a lotação (quando informada) é recusa clara, nunca lista de espera.
 */
export function whyCannotEnroll(session: Session, activeEnrollmentsCount: number): string | null {
  if (session.status !== 'published') {
    return 'Inscrição só em turma publicada: publicar é justamente abrir a inscrição.';
  }
  if (session.capacity !== null && activeEnrollmentsCount >= session.capacity) {
    return `A turma está LOTADA (${activeEnrollmentsCount} de ${session.capacity} vagas): lista de espera é capacidade futura.`;
  }
  return null;
}

/** A recusa da presença, com nome — a mesma física do gatilho de transição. */
export function whyCannotRecordAttendance(session: Session): string | null {
  if (session.status !== 'published' && session.status !== 'concluded') {
    return `Presença só em turma publicada ou concluída (esta está ${session.status}).`;
  }
  return null;
}

// -----------------------------------------------------------------------------
// RESUMOS — sem inventar número (Lei 7)
// -----------------------------------------------------------------------------

export interface SessionSummary {
  readonly total: number;
  readonly draft: number;
  readonly published: number;
  readonly concluded: number;
  readonly cancelled: number;
}

export function summarizeSessions(sessions: readonly Session[]): SessionSummary {
  let draft = 0;
  let published = 0;
  let concluded = 0;
  let cancelled = 0;
  for (const s of sessions) {
    if (s.status === 'draft') draft += 1;
    else if (s.status === 'published') published += 1;
    else if (s.status === 'concluded') concluded += 1;
    else cancelled += 1;
  }
  return { total: sessions.length, draft, published, concluded, cancelled };
}

export interface EnrollmentSummary {
  readonly total: number;
  readonly registered: number;
  readonly attended: number;
  readonly completed: number;
  readonly cancelled: number;
}

export function summarizeEnrollments(enrollments: readonly Enrollment[]): EnrollmentSummary {
  let registered = 0;
  let attended = 0;
  let completed = 0;
  let cancelled = 0;
  for (const e of enrollments) {
    if (e.status === 'registered') registered += 1;
    else if (e.status === 'attended') attended += 1;
    else if (e.status === 'completed') completed += 1;
    else cancelled += 1;
  }
  return { total: enrollments.length, registered, attended, completed, cancelled };
}

// -----------------------------------------------------------------------------
// VALIDAÇÃO — o mínimo honesto (Regra de Ouro: a régua vive aqui, não na tela)
// -----------------------------------------------------------------------------

const NOME_MAX = 200;
const TITULO_MAX = 200;
const DESCRICAO_MAX = 2000;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Valida um programa novo. Só o nome é obrigatório; descrição é opcional. */
export function validateNewProgram(input: NewProgramInput): Validation<Program> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome do programa.' });
  } else if (name.length > NOME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  let description = texto(input.description) ?? '';
  if (description.length > DESCRICAO_MAX) {
    problems.push({ field: 'description', message: `Descrição com no máximo ${DESCRICAO_MAX} caracteres.` });
    description = description.slice(0, DESCRICAO_MAX);
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: { id: '', name: name!, description, status: 'active' },
  };
}

/** Valida uma turma nova. Programa, título e início são obrigatórios; capacidade é opcional. */
export function validateNewSession(input: NewSessionInput): Validation<Session> {
  const problems: Problem[] = [];

  const programId = texto(input.programId);
  if (programId === null) {
    problems.push({ field: 'programId', message: 'Informe o programa da turma.' });
  }

  const title = texto(input.title);
  if (title === null) {
    problems.push({ field: 'title', message: 'Informe o título da turma.' });
  } else if (title.length > TITULO_MAX) {
    problems.push({ field: 'title', message: `Título com no máximo ${TITULO_MAX} caracteres.` });
  }

  const startsAt = texto(input.startsAt);
  if (startsAt === null || !DATE_TIME_RE.test(startsAt)) {
    problems.push({ field: 'startsAt', message: 'Informe a data e hora de início da turma.' });
  }

  let capacity: number | null = null;
  if (input.capacity !== undefined && input.capacity !== null && input.capacity !== '') {
    const n = Number(input.capacity);
    if (!Number.isInteger(n) || n <= 0) {
      problems.push({ field: 'capacity', message: 'A capacidade, quando informada, deve ser um inteiro maior que zero.' });
    } else {
      capacity = n;
    }
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      programId: programId!,
      title: title!,
      startsAt: startsAt!,
      capacity,
      status: 'draft',
    },
  };
}

/** Valida uma inscrição nova. Turma, colaborador (id solto) e nome são obrigatórios. */
export function validateNewEnrollment(input: NewEnrollmentInput): Validation<Enrollment> {
  const problems: Problem[] = [];

  const sessionId = texto(input.sessionId);
  if (sessionId === null) {
    problems.push({ field: 'sessionId', message: 'Informe a turma.' });
  }

  const traineeId = texto(input.traineeId);
  if (traineeId === null) {
    problems.push({ field: 'traineeId', message: 'Informe o colaborador (id).' });
  }

  const traineeName = texto(input.traineeName);
  if (traineeName === null) {
    problems.push({ field: 'traineeName', message: 'Informe o nome do colaborador.' });
  } else if (traineeName.length > NOME_MAX) {
    problems.push({ field: 'traineeName', message: `Nome com no máximo ${NOME_MAX} caracteres.` });
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      sessionId: sessionId!,
      traineeId: traineeId!,
      traineeName: traineeName!,
      status: 'registered',
      attendedAt: null,
      completedAt: null,
      grade: '',
    },
  };
}
