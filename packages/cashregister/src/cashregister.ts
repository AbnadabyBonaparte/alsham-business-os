/**
 * O motor puro do Módulo 73 — Sessão de Caixa.
 *
 * ⭐ **Regra de Ouro (CLAUDE.md §5.3):** tudo o que DECIDE mora aqui. A tela
 * pergunta e desenha; ela nunca decide se uma sessão pode ser fechada.
 *
 * ⭐ `ALLOWED_TRANSITIONS` abaixo é o espelho EXATO de
 * `cashregister.allowed_transition()` no `0088_cashregister.sql`, e um teste lê
 * a migration e confere que os dois dizem a mesma coisa. `open → closed`, e
 * `closed` é TERMINAL: o turno encerrado não reabre.
 *
 * ⛔ **`computeDifference` NÃO existe aqui de propósito.** A conferência
 * "esperado × contado" (a quebra de caixa) exigiria SOMAR as vendas do `pdv` —
 * leitura de schema alheio, acoplamento proibido. Essa reconciliação é da TELA,
 * alimentada de FORA; este módulo guarda só as CONTAGENS FÍSICAS (abertura e
 * fechamento).
 */
import type {
  CloseSessionInput,
  NewSessionInput,
  Problem,
  Session,
  SessionStatus,
  Validation,
} from './types.ts';

/**
 * ⭐ open → closed, e SÓ. `closed` é TERMINAL — espelho EXATO de
 * `cashregister.allowed_transition`.
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [SessionStatus, SessionStatus])[] = [
  ['open', 'closed'],
];

/** Todos os estados — para os testes varrerem a matriz N×N. */
export const ALL_STATUSES: readonly SessionStatus[] = ['open', 'closed'];

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS.some(([de, para]) => de === from && para === to);
}

export function nextStatuses(from: SessionStatus): readonly SessionStatus[] {
  return ALLOWED_TRANSITIONS.filter(([de]) => de === from).map(([, para]) => para);
}

/** Fechar (open→closed) só existe para a sessão aberta. */
export function canClose(status: SessionStatus): boolean {
  return status === 'open';
}

const NOME_MAX = 200;
const NOTA_MAX = 2000;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

/** Um inteiro >= 0 (centavos). Recusa fracionário, NaN, string e negativo. */
function centavosNaoNegativos(valor: unknown): number | null {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 0) return null;
  return valor;
}

/**
 * Valida uma sessão nova (sempre nasce `open`, com contagem de fechamento nula).
 * caixa obrigatório; fundo de troco inteiro >= 0; operador opcional; moeda de 3
 * caracteres. Nasce com `id` vazio.
 */
export function validateNewSession(input: NewSessionInput): Validation<Session> {
  const problems: Problem[] = [];

  const registerName = texto(input.registerName);
  if (registerName === null) {
    problems.push({ field: 'registerName', message: 'Informe o caixa (a gaveta física).' });
  } else if (registerName.length > NOME_MAX) {
    problems.push({ field: 'registerName', message: `Nome do caixa com no máximo ${NOME_MAX} caracteres.` });
  }

  // ⭐ Operador OPCIONAL — temporário/terceiro não tem cadastro (id solto ao hr).
  const operatorId = texto(input.operatorId);
  const operatorName = texto(input.operatorName) ?? '';

  // ⭐ Fundo de troco: inteiro >= 0. Gaveta vazia a 0 é honesto.
  let openingAmountCents = 0;
  if (input.openingAmountCents !== undefined && input.openingAmountCents !== null) {
    const v = centavosNaoNegativos(input.openingAmountCents);
    if (v === null) {
      problems.push({
        field: 'openingAmountCents',
        message: 'O fundo de troco deve ser um valor inteiro em centavos, zero ou positivo.',
      });
    } else {
      openingAmountCents = v;
    }
  }

  const currency = texto(input.currency) ?? 'BRL';
  if (currency.length !== 3) {
    problems.push({ field: 'currency', message: 'A moeda deve ter exatamente 3 caracteres.' });
  }

  let note = texto(input.note) ?? '';
  if (note.length > NOTA_MAX) {
    problems.push({ field: 'note', message: `Observação com no máximo ${NOTA_MAX} caracteres.` });
    note = note.slice(0, NOTA_MAX);
  }

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    value: {
      id: '',
      registerName: registerName!,
      operatorId,
      operatorName,
      openingAmountCents,
      closingAmountCents: null,
      currency,
      status: 'open',
      note,
    },
  };
}

/**
 * Valida o fechamento: a contagem física da gaveta é OBRIGATÓRIA e inteiro
 * >= 0. Sem número, não fecha (Lei 7 — fechar exige a contagem física).
 */
export function validateClose(input: CloseSessionInput): Validation<{ closingAmountCents: number }> {
  const problems: Problem[] = [];

  const closingAmountCents = centavosNaoNegativos(input.closingAmountCents);
  if (closingAmountCents === null) {
    problems.push({
      field: 'closingAmountCents',
      message: 'Fechar o caixa exige a contagem física da gaveta (valor inteiro em centavos, zero ou positivo).',
    });
  }

  if (problems.length > 0) return { ok: false, problems };

  return { ok: true, value: { closingAmountCents: closingAmountCents! } };
}
