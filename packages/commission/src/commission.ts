/**
 * O motor puro do Módulo 99 — Comissões (Vertical Beleza).
 *
 * ⭐⭐ A física é a do LANÇAMENTO IMUTÁVEL (o `timesheet`, o `pcost`, o
 * `loyalty`): a comissão é fato consumado — nasce e nunca muda. Por isso este
 * motor NÃO TEM transições de ciclo de vida, NÃO TEM `ALLOWED_TRANSITIONS`,
 * NÃO TEM `canTransition`. A ausência é a lei: um teste lê o
 * `0114_commission.sql` e confere que a migration também não declara
 * `allowed_transition` e não tem coluna de status.
 *
 * ⚠️ **NÃO é motor de cálculo (Lei 7).** Não há aqui — de propósito — nenhuma
 * função que multiplique `baseAmountCents` por um percentual para chegar à
 * comissão. O valor da comissão é REGISTRADO por quem lança; `summarize` apenas
 * SOMA o que já está no livro, nunca deriva.
 */
import type {
  Commission,
  CommissionSummary,
  NewCommissionInput,
  Problem,
  ProfessionalCommission,
  Validation,
} from './types.ts';

/** Do dia mais recente ao mais antigo — a leitura do livro. Tiebreak por id. */
export function orderCommissions(commissions: readonly Commission[]): readonly Commission[] {
  return [...commissions].sort((a, b) => {
    if (a.occurredOn !== b.occurredOn) return a.occurredOn < b.occurredOn ? 1 : -1;
    return a.id.localeCompare(b.id);
  });
}

/** A soma pura das comissões do livro. Nunca chute — sempre soma. */
export function totalCents(commissions: readonly Commission[]): number {
  return commissions.reduce((soma, c) => soma + c.commissionAmountCents, 0);
}

/**
 * Agrupa por profissional e soma as comissões de cada um. Cada profissional
 * vira uma linha com o total (soma dos valores) e a contagem. Os nomes saem em
 * ordem estável.
 */
export function groupByProfessional(
  commissions: readonly Commission[],
): readonly ProfessionalCommission[] {
  const mapa = new Map<string, { totalCents: number; count: number }>();
  for (const c of commissions) {
    const atual = mapa.get(c.professionalName) ?? { totalCents: 0, count: 0 };
    atual.totalCents += c.commissionAmountCents;
    atual.count += 1;
    mapa.set(c.professionalName, atual);
  }
  return [...mapa.entries()]
    .map(([professionalName, v]) => ({
      professionalName,
      totalCents: v.totalCents,
      count: v.count,
    }))
    .sort((a, b) => a.professionalName.localeCompare(b.professionalName));
}

/** Um resumo contável do livro — total de linhas, total em centavos, por pessoa. */
export function summarize(commissions: readonly Commission[]): CommissionSummary {
  return {
    total: commissions.length,
    totalCents: totalCents(commissions),
    byProfessional: groupByProfessional(commissions),
  };
}

const PROFESSIONAL_NAME_MAX = 200;
const SERVICE_MAX = 200;
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
  // Confere que o round-trip bate (recusa 2027-02-30 etc.).
  return d.toISOString().slice(0, 10) === t ? t : null;
}

/**
 * Valida uma comissão nova. O profissional (id solto + nome), o serviço, o
 * valor da comissão e o dia são obrigatórios; o valor da comissão tem de ser um
 * inteiro (centavos) `>= 0` (zero é cortesia; negativo não — corrigir é lançar
 * o ato inverso, e o CHECK do banco confere `commission_amount_cents >= 0`); o
 * valor-base é OPCIONAL e apenas INFORMATIVO (⚠️ o motor NUNCA o usa para
 * derivar a comissão); a observação é OPCIONAL. Nasce com `id` vazio: a pura
 * camada nunca inventa dado do servidor.
 */
export function validateNewCommission(input: NewCommissionInput): Validation<Commission> {
  const problems: Problem[] = [];

  // Profissional: id solto obrigatório.
  const professionalId = texto(input.professionalId);
  if (professionalId === null) {
    problems.push({ field: 'professionalId', message: 'Informe o profissional da comissão.' });
  }

  // Nome do profissional carimbado pela tela — obrigatório e não-vazio.
  const professionalName = texto(input.professionalName);
  if (professionalName === null) {
    problems.push({ field: 'professionalName', message: 'Informe o nome do profissional.' });
  } else if (professionalName.length > PROFESSIONAL_NAME_MAX) {
    problems.push({
      field: 'professionalName',
      message: `Nome com no máximo ${PROFESSIONAL_NAME_MAX} caracteres.`,
    });
  }

  // Serviço: texto livre obrigatório.
  const service = texto(input.service);
  if (service === null) {
    problems.push({ field: 'service', message: 'Informe o serviço prestado.' });
  } else if (service.length > SERVICE_MAX) {
    problems.push({ field: 'service', message: `Serviço com no máximo ${SERVICE_MAX} caracteres.` });
  }

  // Valor-base: OPCIONAL, informativo, inteiro >= 0 se vier.
  let baseAmountCents: number | null = null;
  if (input.baseAmountCents !== undefined && input.baseAmountCents !== null) {
    const b = input.baseAmountCents;
    if (typeof b !== 'number' || !Number.isInteger(b) || b < 0) {
      problems.push({
        field: 'baseAmountCents',
        message: 'Valor-base do serviço em centavos (inteiro, ≥ 0), ou vazio.',
      });
    } else {
      baseAmountCents = b;
    }
  }

  // Valor da comissão: obrigatório, inteiro (centavos) >= 0. REGISTRADO, nunca
  // derivado de percentual. Zero é cortesia; negativo não é comissão.
  let commissionAmountCents: number | null = null;
  const a = input.commissionAmountCents;
  if (a === undefined || a === null) {
    problems.push({ field: 'commissionAmountCents', message: 'Informe o valor da comissão.' });
  } else if (typeof a !== 'number' || !Number.isInteger(a) || a < 0) {
    problems.push({
      field: 'commissionAmountCents',
      message: 'O valor da comissão deve ser um inteiro em centavos, ≥ 0.',
    });
  } else {
    commissionAmountCents = a;
  }

  // Dia: obrigatório, data ISO real.
  let occurredOn: string | null = null;
  if (input.occurredOn === undefined || input.occurredOn === null || input.occurredOn === '') {
    problems.push({ field: 'occurredOn', message: 'Informe o dia em que o serviço aconteceu.' });
  } else {
    const d = dataIso(input.occurredOn);
    if (d === null) problems.push({ field: 'occurredOn', message: 'A data deve estar no formato AAAA-MM-DD.' });
    else occurredOn = d;
  }

  // Observação opcional.
  const notaBruta = texto(input.note);
  let note = '';
  if (notaBruta !== null) {
    if (notaBruta.length > NOTE_MAX) {
      problems.push({ field: 'note', message: `Observação com no máximo ${NOTE_MAX} caracteres.` });
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
      professionalId: professionalId!,
      professionalName: professionalName!,
      service: service!,
      baseAmountCents,
      commissionAmountCents: commissionAmountCents!,
      occurredOn: occurredOn!,
      note,
    },
  };
}
