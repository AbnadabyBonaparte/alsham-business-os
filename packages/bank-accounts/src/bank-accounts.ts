import type { AccountStatus, BankAccount, Movement, Problem, Validation } from './types.ts';

/**
 * O motor do Módulo 30 — Contas Bancárias.
 *
 * A tela consome; NUNCA decide (Regra de Ouro).
 */

/**
 * ⭐ Espelho de `bank.allowed_transition()` no `0045_bank.sql` — há teste que
 * lê a migration e compara. A conta volta do arquivo (o argumento do crm/cash).
 */
export const ALLOWED_TRANSITIONS: readonly (readonly [AccountStatus, AccountStatus])[] = [
  ['active', 'archived'],
  ['archived', 'active'],
];

export function canTransition(from: AccountStatus, to: AccountStatus): boolean {
  return ALLOWED_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

export function canArchive(status: AccountStatus): boolean {
  return canTransition(status, 'archived');
}

export function canRestore(status: AccountStatus): boolean {
  return canTransition(status, 'active');
}

/** O saldo de uma conta a partir do seu livro — soma dos sinais; pode ser negativo. */
export function balanceOf(movements: readonly Movement[]): number {
  return movements.reduce((n, m) => n + m.signedAmountCents, 0);
}

/** ⭐ O saldo NEGATIVO é legítimo (cheque especial) — não é erro, é estado. */
export function isOverdrawn(balanceCents: number): boolean {
  return balanceCents < 0;
}

/** As contas na ordem de leitura: ativas primeiro, depois arquivadas; por nome. */
export function orderAccounts(accounts: readonly BankAccount[]): readonly BankAccount[] {
  return [...accounts].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

const NAME_MAX = 200;

function texto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const limpo = valor.trim();
  return limpo.length === 0 ? null : limpo;
}

export interface NewAccountInput {
  readonly name?: unknown;
  readonly bankName?: unknown;
  readonly branch?: unknown;
  readonly accountNumber?: unknown;
  readonly currency?: unknown;
}

/** Valida uma conta nova — apelido obrigatório, moeda ISO; banco/agência livres. */
export function validateNewAccount(
  input: NewAccountInput,
): Validation<{ name: string; bankName: string; branch: string; accountNumber: string; currency: string }> {
  const problems: Problem[] = [];

  const name = texto(input.name);
  if (name === null) problems.push({ field: 'name', message: 'Dê um apelido à conta.' });
  else if (name.length > NAME_MAX) problems.push({ field: 'name', message: `Apelido com no máximo ${NAME_MAX} caracteres.` });

  const currency = texto(input.currency);
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'A moeda é um código ISO — a conta tem uma moeda.' });
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      name: name!,
      bankName: (texto(input.bankName) ?? ''),
      branch: (texto(input.branch) ?? ''),
      accountNumber: (texto(input.accountNumber) ?? ''),
      currency: currency!,
    },
  };
}

export interface NewMovementInput {
  readonly kind?: unknown;
  readonly amountCents?: unknown;
  readonly currency?: unknown;
  readonly occurredOn?: unknown;
  readonly reason?: unknown;
}

/** Valida um lançamento avulso — valor pelo tipo, moeda, competência, razão do ajuste. */
export function validateMovement(
  input: NewMovementInput,
): Validation<{ kind: 'in' | 'out' | 'adjustment'; amountCents: number; currency: string; occurredOn: string; reason: string }> {
  const problems: Problem[] = [];

  const kind = input.kind;
  if (kind !== 'in' && kind !== 'out' && kind !== 'adjustment') {
    problems.push({ field: 'kind', message: 'O tipo é entrada, saída ou ajuste.' });
  }

  const amountCents = input.amountCents;
  const isInt = typeof amountCents === 'number' && Number.isInteger(amountCents);
  if (!isInt) {
    problems.push({ field: 'amountCents', message: 'O valor é em centavos inteiros.' });
  } else if ((kind === 'in' || kind === 'out') && (amountCents as number) <= 0) {
    problems.push({ field: 'amountCents', message: 'Entrada e saída têm valor positivo.' });
  } else if (kind === 'adjustment' && (amountCents as number) === 0) {
    problems.push({ field: 'amountCents', message: 'O ajuste move a conta — zero não ajusta nada.' });
  }

  const currency = texto(input.currency);
  if (currency === null || !/^[A-Z]{3}$/.test(currency)) {
    problems.push({ field: 'currency', message: 'A moeda é um código ISO — a do lançamento é a da conta.' });
  }

  const occurredOn = texto(input.occurredOn);
  if (occurredOn === null || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    problems.push({ field: 'occurredOn', message: 'A competência é uma data.' });
  }

  const reason = texto(input.reason) ?? '';
  if (kind === 'adjustment' && reason.length === 0) {
    problems.push({ field: 'reason', message: 'Ajuste exige razão — a linha muda esconde o desvio.' });
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: {
      kind: kind as 'in' | 'out' | 'adjustment',
      amountCents: amountCents as number,
      currency: currency!,
      occurredOn: occurredOn!,
      reason,
    },
  };
}

export interface TransferInput {
  readonly fromAccountId?: unknown;
  readonly toAccountId?: unknown;
  readonly amountCents?: unknown;
  readonly occurredOn?: unknown;
}

/** Valida uma transferência — contas distintas, valor positivo, data não-futura. */
export function validateTransfer(
  input: TransferInput,
  today: string,
): Validation<{ fromAccountId: string; toAccountId: string; amountCents: number; occurredOn: string }> {
  const problems: Problem[] = [];

  const from = texto(input.fromAccountId);
  const to = texto(input.toAccountId);
  if (from === null) problems.push({ field: 'fromAccountId', message: 'Escolha a conta de origem.' });
  if (to === null) problems.push({ field: 'toAccountId', message: 'Escolha a conta de destino.' });
  if (from !== null && to !== null && from === to) {
    problems.push({ field: 'toAccountId', message: 'Transferência exige contas diferentes.' });
  }

  const amountCents = input.amountCents;
  if (typeof amountCents !== 'number' || !Number.isInteger(amountCents) || amountCents <= 0) {
    problems.push({ field: 'amountCents', message: 'O valor da transferência é positivo.' });
  }

  const occurredOn = texto(input.occurredOn);
  if (occurredOn === null || !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)) {
    problems.push({ field: 'occurredOn', message: 'A data é uma competência válida.' });
  } else if (occurredOn > today) {
    problems.push({ field: 'occurredOn', message: 'Transferência não é agendamento: a data não é futura.' });
  }

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    value: { fromAccountId: from!, toAccountId: to!, amountCents: amountCents as number, occurredOn: occurredOn! },
  };
}
