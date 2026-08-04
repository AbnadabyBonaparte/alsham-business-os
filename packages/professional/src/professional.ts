import type {
  NewProfessionalInput,
  Problem,
  Professional,
  ProfessionalStatus,
  Validation,
} from './types.ts';

/**
 * O motor do Módulo 98 — Profissionais.
 *
 * A tela consome; NUNCA decide (Regra de Ouro). Quem impede de verdade é a
 * RLS e os gatilhos do `0113_professional.sql`; o pacote avisa antes, com a
 * MESMA régua.
 *
 * ⭐ Este módulo NÃO reescreve o hr: o vínculo de colaborador é por id solto
 * (`hrEmployeeId`). Aqui mora só o roster do salão e o ciclo `active ↔
 * archived`.
 */

/**
 * ⭐ Espelho de `professional.allowed_transition()` no `0113_professional.sql` —
 * há teste que lê a migration e compara. `active ↔ archived`: o profissional é
 * relação que volta — o DIVERGE do `hr` (`terminated` é TERMINAL). O
 * cadeira-alugada que sai e volta é a MESMA pessoa; obrigá-la a renascer
 * partiria o histórico em dois.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [ProfessionalStatus, ProfessionalStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

export function canTransition(from: ProfessionalStatus, to: ProfessionalStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canArchive(status: ProfessionalStatus): boolean {
  return canTransition(status, 'archived');
}

export function canReactivate(status: ProfessionalStatus): boolean {
  return canTransition(status, 'active');
}

export function isArchived(status: ProfessionalStatus): boolean {
  return status === 'archived';
}

/** O roster: ativos primeiro, depois por nome. */
export function orderProfessionals(professionals: readonly Professional[]): readonly Professional[] {
  const peso = (s: ProfessionalStatus): number => (s === 'active' ? 0 : 1);
  return [...professionals].sort((a, b) => {
    if (peso(a.status) !== peso(b.status)) return peso(a.status) - peso(b.status);
    return a.name.localeCompare(b.name);
  });
}

export interface ProfessionalSummary {
  readonly total: number;
  readonly active: number;
  readonly archived: number;
}

export function summarize(professionals: readonly Professional[]): ProfessionalSummary {
  let active = 0;
  let archived = 0;
  for (const p of professionals) {
    if (p.status === 'active') active += 1;
    else archived += 1;
  }
  return { total: professionals.length, active, archived };
}

const NAME_MAX = 200;
const SPECIALTY_MAX = 120;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/**
 * Valida um profissional novo. `name` é OBRIGATÓRIO — um roster sem nome é uma
 * linha muda. `specialty` é opcional (TEXTO LIVRE — o sistema não conhece
 * "cabeleireiro/manicure"). `hrEmployeeId` é ID SOLTO OPCIONAL: a validação
 * confere apenas que, quando informado, é texto — nunca que a linha existe no
 * hr (isso é integridade de outro schema).
 */
export function validateNewProfessional(input: NewProfessionalInput): Validation<Professional> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) {
    problems.push({ field: 'name', message: 'Informe o nome do profissional.' });
  } else if (name.length > NAME_MAX) {
    problems.push({ field: 'name', message: `Nome com no máximo ${NAME_MAX} caracteres.` });
  }

  const specialty = texto(input.specialty) ?? '';
  if (specialty.length > SPECIALTY_MAX) {
    problems.push({ field: 'specialty', message: `Especialidade com no máximo ${SPECIALTY_MAX} caracteres.` });
  }

  const hrEmployeeId = texto(input.hrEmployeeId);

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return {
    ok: true,
    value: {
      id: '',
      name: name!,
      specialty,
      hrEmployeeId,
      status: 'active',
    },
  };
}
